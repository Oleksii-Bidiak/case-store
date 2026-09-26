import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  OrderHistoryChangeType,
  OrderHistoryNote,
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
} from '@prisma/client';
import { SalesRepository } from '../src/analytics/reports/sales.repository';
import { ReportRange, resolveReportPeriod } from '../src/analytics/reports/report-period';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for the sales report's money (TASK-686, plan 188) — the REAL
 * `SalesRepository` against a REAL Postgres. This is the formula the owner will
 * answer "how much did I earn in August" with, so it is pinned here on real rows
 * rather than on a mocked repository:
 *
 * - **Sales** of a range = Σ `orders.total` of orders CREATED in it whose payment
 *   is PAID / PARTIALLY_REFUNDED / REFUNDED. A later refund never changes it.
 * - **Refunds** of a range = returns REFUNDED in it (by `resolved_at`) plus the
 *   full-refund residual of orders whose payment is now REFUNDED, dated by the
 *   move into REFUNDED in the order's history.
 *
 * The three plan-188 gates come first; nothing is accepted without them.
 *
 * Every fixture is dated in 2025 so the global aggregates never meet the
 * now()-dated rows other suites create, and every test removes its own rows.
 * Run with `npm run test:int -w apps/store-api` (DB up + migrated), serially.
 */

const NOW = new Date('2026-09-26T12:00:00Z');

/** A report range over Kyiv days `from…to`, exactly as the API would build it. */
function days(from: string, to: string): ReportRange {
  return resolveReportPeriod({ preset: 'custom', from, to }, NOW).current;
}

const AUG = days('2025-08-01', '2025-08-31');
const SEP = days('2025-09-01', '2025-09-30');
const OCT = days('2025-10-01', '2025-10-31');

describe('SalesRepository (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: SalesRepository;

  const createdOrderIds: string[] = [];

  async function createOrder(opts: {
    createdAt: string;
    total: string;
    paymentStatus: PaymentStatus;
    status?: OrderStatus;
  }): Promise<string> {
    const order = await prisma.order.create({
      data: {
        guestEmail: `sales-${randomUUID()}@test.local`,
        status: opts.status ?? OrderStatus.DELIVERED,
        paymentStatus: opts.paymentStatus,
        subtotal: opts.total,
        total: opts.total,
        createdAt: new Date(opts.createdAt),
      },
    });
    createdOrderIds.push(order.id);
    return order.id;
  }

  async function addReturn(
    orderId: string,
    opts: { amount: string | null; resolvedAt: string | null; status?: ReturnStatus },
  ): Promise<void> {
    await prisma.return.create({
      data: {
        orderId,
        status: opts.status ?? ReturnStatus.REFUNDED,
        refundedAmount: opts.amount,
        resolvedAt: opts.resolvedAt === null ? null : new Date(opts.resolvedAt),
      },
    });
  }

  async function addPaymentMove(
    orderId: string,
    opts: {
      from: PaymentStatus;
      to: PaymentStatus;
      changedAt: string;
      note?: OrderHistoryNote;
    },
  ): Promise<void> {
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        changeType: OrderHistoryChangeType.PAYMENT_STATUS,
        fromPaymentStatus: opts.from,
        toPaymentStatus: opts.to,
        changedAt: new Date(opts.changedAt),
        ...(opts.note ? { note: opts.note } : {}),
      },
    });
  }

  function dayOf(series: Array<{ date: string }>, date: string) {
    const point = series.find((p) => p.date === date);
    if (!point) throw new Error(`no point for ${date} in the series`);
    return point;
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, SalesRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(SalesRepository);

    // The report aggregates the whole table, so 2025 must be ours alone.
    const year = { gte: new Date('2024-12-31T00:00:00Z'), lt: new Date('2026-01-02T00:00:00Z') };
    const leftovers =
      (await prisma.order.count({ where: { createdAt: year } })) +
      (await prisma.return.count({ where: { resolvedAt: year } })) +
      (await prisma.orderStatusHistory.count({ where: { changedAt: year } }));
    if (leftovers > 0) {
      throw new Error(
        `The test database already holds ${leftovers} rows dated 2025; clean it first`,
      );
    }
  });

  afterEach(async () => {
    if (createdOrderIds.length === 0) return;
    const ids = createdOrderIds.splice(0);
    // Returns are Restrict on the order; history rows cascade with it.
    await prisma.return.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── The three plan-188 gates ──────────────────────────────────────────────

  describe('gate 1 — a refund lands in the month it happened, not the month of the sale', () => {
    beforeEach(async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-10T09:00:00Z',
        total: '1000.10',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      await addReturn(orderId, { amount: '300.05', resolvedAt: '2025-09-05T10:00:00Z' });
    });

    it('gives August the full sale and no refund', async () => {
      expect(await repo.getTotals(AUG)).toEqual({ sales: 1000.1, refunds: 0, orders: 1 });
    });

    it('gives September the refund and no sale, so its net is negative', async () => {
      expect(await repo.getTotals(SEP)).toEqual({ sales: 0, refunds: 300.05, orders: 0 });

      const daily = await repo.getDaily(SEP);
      expect(dayOf(daily, '2025-09-05')).toEqual({
        date: '2025-09-05',
        sales: 0,
        refunds: 300.05,
        net: -300.05,
      });
    });

    it('puts the sale on its own day of the August series', async () => {
      const daily = await repo.getDaily(AUG);
      expect(dayOf(daily, '2025-08-10')).toEqual({
        date: '2025-08-10',
        sales: 1000.1,
        refunds: 0,
        net: 1000.1,
      });
    });
  });

  describe('gate 2 — PARTIALLY_REFUNDED stays in sales with its full total', () => {
    it('counts the whole order in its month and the partial return in the return’s month only', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-12T08:00:00Z',
        total: '800.00',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      await addReturn(orderId, { amount: '250.00', resolvedAt: '2025-08-20T08:00:00Z' });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 800, refunds: 250, orders: 1 });
      expect(await repo.getTotals(SEP)).toEqual({ sales: 0, refunds: 0, orders: 0 });
    });
  });

  describe('gate 3 — an empty period is zeros, not an empty answer', () => {
    it('returns zero totals and one zero point for every day of the range', async () => {
      const range = days('2025-03-01', '2025-03-10');

      expect(await repo.getTotals(range)).toEqual({ sales: 0, refunds: 0, orders: 0 });

      const daily = await repo.getDaily(range);
      expect(daily).toHaveLength(range.days);
      expect(daily).toEqual(
        Array.from({ length: 10 }, (_, i) => ({
          date: `2025-03-${String(i + 1).padStart(2, '0')}`,
          sales: 0,
          refunds: 0,
          net: 0,
        })),
      );
    });
  });

  // ── Which orders are sales at all ─────────────────────────────────────────

  describe('base statuses', () => {
    it('ignores orders whose payment is PENDING or FAILED', async () => {
      await createOrder({
        createdAt: '2025-08-03T09:00:00Z',
        total: '90.00',
        paymentStatus: PaymentStatus.PENDING,
        status: OrderStatus.CONFIRMED,
      });
      await createOrder({
        createdAt: '2025-08-04T09:00:00Z',
        total: '70.00',
        paymentStatus: PaymentStatus.FAILED,
        status: OrderStatus.CANCELLED,
      });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 0, refunds: 0, orders: 0 });
    });
  });

  // ── The full-refund residual ──────────────────────────────────────────────

  describe('full-refund residual (a REFUNDED payment without a Return)', () => {
    it('counts a cancellation after payment as a refund in the month the payment went REFUNDED', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-15T09:00:00Z',
        total: '1200.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PENDING,
        to: PaymentStatus.PAID,
        changedAt: '2025-08-15T09:05:00Z',
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-09-03T12:00:00Z',
      });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 1200, refunds: 0, orders: 1 });
      expect(await repo.getTotals(SEP)).toEqual({ sales: 0, refunds: 1200, orders: 0 });
      expect(dayOf(await repo.getDaily(SEP), '2025-09-03').refunds).toBe(1200);
    });

    it('does not count a full refund twice when a Return already carries the whole amount', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-05T09:00:00Z',
        total: '700.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.REFUNDED,
      });
      await addReturn(orderId, { amount: '700.00', resolvedAt: '2025-09-04T10:00:00Z' });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-09-04T10:01:00Z',
      });

      expect(await repo.getTotals(SEP)).toEqual({ sales: 0, refunds: 700, orders: 0 });
    });

    it('adds only what the Returns did not cover, in the month of the full refund', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-05T09:00:00Z',
        total: '700.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
      });
      await addReturn(orderId, { amount: '200.00', resolvedAt: '2025-08-25T10:00:00Z' });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PARTIALLY_REFUNDED,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-09-06T10:00:00Z',
      });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 700, refunds: 200, orders: 1 });
      expect(await repo.getTotals(SEP)).toEqual({ sales: 0, refunds: 500, orders: 0 });
    });

    it('ignores history rows that carry a note when dating the refund', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-07T09:00:00Z',
        total: '400.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-08-20T10:00:00Z',
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-09-15T10:00:00Z',
        note: OrderHistoryNote.PAID_AFTER_CANCEL,
      });

      expect((await repo.getTotals(AUG)).refunds).toBe(400);
      expect((await repo.getTotals(SEP)).refunds).toBe(0);
    });

    it('ignores a refused provider event recorded as REFUNDED → REFUNDED when dating the refund', async () => {
      // `applyPaymentOutcome` writes a refused move as `current → current` with no
      // note (e.g. a late "success" on an order already REFUNDED). It is not the
      // moment the money went back, so it must not move the refund to its month.
      const orderId = await createOrder({
        createdAt: '2025-08-07T09:00:00Z',
        total: '400.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-08-20T10:00:00Z',
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.REFUNDED,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-09-15T10:00:00Z',
      });

      expect((await repo.getTotals(AUG)).refunds).toBe(400);
      expect((await repo.getTotals(SEP)).refunds).toBe(0);
    });

    it('dates by the LATEST move into REFUNDED', async () => {
      // REFUNDED by mistake in August, corrected to PAID, refunded for real in September.
      const orderId = await createOrder({
        createdAt: '2025-08-07T09:00:00Z',
        total: '400.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-08-20T10:00:00Z',
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.REFUNDED,
        to: PaymentStatus.PAID,
        changedAt: '2025-08-21T10:00:00Z',
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-09-10T10:00:00Z',
      });

      expect((await repo.getTotals(AUG)).refunds).toBe(0);
      expect((await repo.getTotals(SEP)).refunds).toBe(400);
    });

    it('counts nothing for an order whose REFUNDED mark was corrected back to PAID', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-07T09:00:00Z',
        total: '400.00',
        paymentStatus: PaymentStatus.PAID,
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-08-20T10:00:00Z',
      });
      await addPaymentMove(orderId, {
        from: PaymentStatus.REFUNDED,
        to: PaymentStatus.PAID,
        changedAt: '2025-08-22T10:00:00Z',
      });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 400, refunds: 0, orders: 1 });
    });
  });

  // ── Whose day ─────────────────────────────────────────────────────────────

  describe('Kyiv day boundaries', () => {
    it('puts an order created at 22:30 UTC on 31 August into Kyiv’s 1 September', async () => {
      await createOrder({
        createdAt: '2025-08-31T22:30:00Z',
        total: '150.00',
        paymentStatus: PaymentStatus.PAID,
      });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 0, refunds: 0, orders: 0 });
      expect(await repo.getTotals(SEP)).toEqual({ sales: 150, refunds: 0, orders: 1 });

      const daily = await repo.getDaily(SEP);
      expect(dayOf(daily, '2025-09-01').sales).toBe(150);
    });

    it('dates returns and full refunds by the Kyiv day too', async () => {
      const withReturn = await createOrder({
        createdAt: '2025-09-02T09:00:00Z',
        total: '100.00',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      // 00:30 Kyiv on 1 October.
      await addReturn(withReturn, { amount: '40.00', resolvedAt: '2025-09-30T21:30:00Z' });

      const refunded = await createOrder({
        createdAt: '2025-09-02T09:00:00Z',
        total: '60.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
      });
      await addPaymentMove(refunded, {
        from: PaymentStatus.PAID,
        to: PaymentStatus.REFUNDED,
        changedAt: '2025-09-30T21:45:00Z',
      });

      expect((await repo.getTotals(SEP)).refunds).toBe(0);
      expect((await repo.getTotals(OCT)).refunds).toBe(100);
      expect(dayOf(await repo.getDaily(OCT), '2025-10-01').refunds).toBe(100);
    });
  });

  // ── Returns that are not money yet ────────────────────────────────────────

  describe('returns that are not refunds', () => {
    it('ignores returns not in REFUNDED and REFUNDED returns without an amount or a date', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-02T09:00:00Z',
        total: '500.00',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      await addReturn(orderId, {
        amount: '100.00',
        resolvedAt: '2025-08-10T09:00:00Z',
        status: ReturnStatus.RECEIVED,
      });
      await addReturn(orderId, { amount: null, resolvedAt: '2025-08-11T09:00:00Z' });
      await addReturn(orderId, { amount: '30.00', resolvedAt: null });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 500, refunds: 0, orders: 1 });
    });
  });

  // ── All time (the dashboard, TASK-694) ────────────────────────────────────

  describe('getTotals(null) — no date bound', () => {
    it('sums every sale and refund ever, by the same rules', async () => {
      const before = await repo.getTotals(null);

      const partial = await createOrder({
        createdAt: '2025-08-10T09:00:00Z',
        total: '1000.10',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      await addReturn(partial, { amount: '300.05', resolvedAt: '2025-09-05T10:00:00Z' });

      // REFUNDED with no history row (e.g. written before history existed):
      // its sale counts, the residual cannot be dated and contributes nothing.
      await createOrder({
        createdAt: '2025-08-11T09:00:00Z',
        total: '50.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
      });

      const after = await repo.getTotals(null);
      expect(Math.round((after.sales - before.sales) * 100) / 100).toBe(1050.1);
      expect(Math.round((after.refunds - before.refunds) * 100) / 100).toBe(300.05);
      expect(after.orders - before.orders).toBe(2);
    });
  });
});
