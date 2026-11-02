import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { SalesRepository } from '../src/analytics/reports/sales.repository';
import { ReportRange, resolveReportPeriod } from '../src/analytics/reports/report-period';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for the sales report's money (TASK-686, plan 188; refunds
 * from the order money ledger since R2 A4) — the REAL `SalesRepository` against
 * a REAL Postgres. This is the formula the owner will answer "how much did I earn
 * in August" with, so it is pinned here on real rows rather than on a mocked
 * repository:
 *
 * - **Sales** of a range = Σ `orders.total` of orders CREATED in it whose payment
 *   is PAID / PARTIALLY_REFUNDED / REFUNDED. A later refund never changes it; a
 *   PARTIALLY_PAID order is not a sale until it is paid (R2 assumption 3).
 * - **Refunds** of a range = the ledger's OUT entries (`order_money_entries`)
 *   dated by `occurred_at` in it, each reversal subtracted on its own day,
 *   voided requests ignored. LiqPay's partial refunds count like any other
 *   (TASK-1500); the old Return-row + history-residual rule is gone — the R2
 *   backfill turned those residuals into entries.
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

  /** One OUT entry of the ledger, in kopecks; returns its id. */
  async function addOut(
    orderId: string,
    opts: {
      amountKop: number;
      at: string;
      kind?: MoneyEntryKind;
      reversalOfId?: string;
      voidedAt?: string;
      providerState?: MoneyProviderState;
    },
  ): Promise<string> {
    const entry = await prisma.orderMoneyEntry.create({
      data: {
        orderId,
        direction: MoneyDirection.OUT,
        kind: opts.kind ?? MoneyEntryKind.CASH_REFUND,
        amountKop: opts.amountKop,
        occurredAt: new Date(opts.at),
        reversalOfId: opts.reversalOfId ?? null,
        voidedAt: opts.voidedAt ? new Date(opts.voidedAt) : null,
        providerState: opts.providerState ?? null,
        ...(opts.reversalOfId ? { reason: 'помилка' } : {}),
      },
    });
    return entry.id;
  }

  function dayOf<T extends { date: string }>(series: T[], date: string): T {
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
      (await prisma.orderMoneyEntry.count({ where: { occurredAt: year } }));
    if (leftovers > 0) {
      throw new Error(
        `The test database already holds ${leftovers} rows dated 2025; clean it first`,
      );
    }
  });

  afterEach(async () => {
    if (createdOrderIds.length === 0) return;
    const ids = createdOrderIds.splice(0);
    // Ledger rows are Restrict on the order and on what they reverse: reversals first.
    await prisma.orderMoneyEntry.deleteMany({
      where: { orderId: { in: ids }, reversalOfId: { not: null } },
    });
    await prisma.orderMoneyEntry.deleteMany({ where: { orderId: { in: ids } } });
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
      await addOut(orderId, { amountKop: 30_005, at: '2025-09-05T10:00:00Z' });
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
    it('counts the whole order in its month and the partial refund in the refund’s month only', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-12T08:00:00Z',
        total: '800.00',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      await addOut(orderId, { amountKop: 25_000, at: '2025-08-20T08:00:00Z' });

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

    it('ignores a PARTIALLY_PAID order until it is paid (R2 assumption 3)', async () => {
      await createOrder({
        createdAt: '2025-08-05T09:00:00Z',
        total: '900.00',
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
        status: OrderStatus.CONFIRMED,
      });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 0, refunds: 0, orders: 0 });
    });
  });

  // ── Refunds come from the ledger ──────────────────────────────────────────

  describe('refunds from the money ledger (R2 A4)', () => {
    it('counts a refund after a cancellation in the month the money went back', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-15T09:00:00Z',
        total: '1200.00',
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.CANCELLED,
      });
      await addOut(orderId, { amountKop: 120_000, at: '2025-09-03T12:00:00Z' });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 1200, refunds: 0, orders: 1 });
      expect(await repo.getTotals(SEP)).toEqual({ sales: 0, refunds: 1200, orders: 0 });
      expect(dayOf(await repo.getDaily(SEP), '2025-09-03').refunds).toBe(1200);
    });

    it('counts LiqPay partial refunds — every one, requested or confirmed (TASK-1500)', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-05T09:00:00Z',
        total: '700.00',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      await addOut(orderId, {
        amountKop: 10_000,
        at: '2025-08-20T10:00:00Z',
        kind: MoneyEntryKind.LIQPAY_REFUND,
        providerState: MoneyProviderState.CONFIRMED,
      });
      await addOut(orderId, {
        amountKop: 15_000,
        at: '2025-08-25T10:00:00Z',
        kind: MoneyEntryKind.LIQPAY_REFUND,
        providerState: MoneyProviderState.REQUESTED,
      });

      expect(await repo.getTotals(AUG)).toEqual({ sales: 700, refunds: 250, orders: 1 });
    });

    it('ignores a voided LiqPay request — it never moved money', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-05T09:00:00Z',
        total: '700.00',
        paymentStatus: PaymentStatus.PAID,
      });
      await addOut(orderId, {
        amountKop: 70_000,
        at: '2025-08-20T10:00:00Z',
        kind: MoneyEntryKind.LIQPAY_REFUND,
        providerState: MoneyProviderState.REQUESTED,
        voidedAt: '2025-08-20T10:05:00Z',
      });

      expect((await repo.getTotals(AUG)).refunds).toBe(0);
    });

    it('nets a reversal out on its own day: same month → 0, next month → negative there', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-07T09:00:00Z',
        total: '400.00',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      const sameMonth = await addOut(orderId, { amountKop: 10_000, at: '2025-08-20T10:00:00Z' });
      await addOut(orderId, {
        amountKop: 10_000,
        at: '2025-08-21T10:00:00Z',
        reversalOfId: sameMonth,
      });
      const lateFix = await addOut(orderId, { amountKop: 5_000, at: '2025-08-22T10:00:00Z' });
      await addOut(orderId, {
        amountKop: 5_000,
        at: '2025-09-10T10:00:00Z',
        reversalOfId: lateFix,
      });

      // A closed month is never rewritten: August keeps the 50 ₴ it reported,
      // September carries the correction.
      expect((await repo.getTotals(AUG)).refunds).toBe(50);
      expect((await repo.getTotals(SEP)).refunds).toBe(-50);
    });

    it('ignores money coming IN', async () => {
      const orderId = await createOrder({
        createdAt: '2025-08-07T09:00:00Z',
        total: '400.00',
        paymentStatus: PaymentStatus.PAID,
      });
      await prisma.orderMoneyEntry.create({
        data: {
          orderId,
          direction: MoneyDirection.IN,
          kind: MoneyEntryKind.COD_NOVA_POSHTA,
          amountKop: 40_000,
          occurredAt: new Date('2025-08-08T10:00:00Z'),
        },
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

    it('dates refunds by the Kyiv day too', async () => {
      const orderId = await createOrder({
        createdAt: '2025-09-02T09:00:00Z',
        total: '100.00',
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
      });
      // 00:30 and 00:45 Kyiv on 1 October.
      await addOut(orderId, { amountKop: 4_000, at: '2025-09-30T21:30:00Z' });
      await addOut(orderId, { amountKop: 6_000, at: '2025-09-30T21:45:00Z' });

      expect((await repo.getTotals(SEP)).refunds).toBe(0);
      expect((await repo.getTotals(OCT)).refunds).toBe(100);
      expect(dayOf(await repo.getDaily(OCT), '2025-10-01').refunds).toBe(100);
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
      await addOut(partial, { amountKop: 30_005, at: '2025-09-05T10:00:00Z' });

      // A REFUNDED label with no ledger row behind it: its sale counts, and a
      // refund nobody recorded is not invented.
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
