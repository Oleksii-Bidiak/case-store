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
import { MoneyFlowRepository } from '../src/analytics/reports/money-flow.repository';
import type { MoneyFlowKindTotals } from '../src/analytics/reports/money-flow.repository';
import { ReportRange, resolveReportPeriod } from '../src/analytics/reports/report-period';
import { SalesRepository } from '../src/analytics/reports/sales.repository';
import { CacheService } from '../src/cache';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import { ProductIndexer } from '../src/search/product-indexer';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for «Рух коштів» (TASK-2395) — the REAL
 * `MoneyFlowRepository` against a REAL Postgres. The accountant reconciles the
 * till against these numbers, so the owner's rules are pinned on real rows:
 *
 * - an entry counts on the Kyiv day of its `occurred_at`; a reversal (сторно)
 *   is subtracted on ITS own day and never rewrites an earlier period;
 * - voided rows never moved money — in no sum, not in the register;
 * - LiqPay refunds still REQUESTED are counted, and reported apart;
 * - legacy (R2 backfill) rows count once, like any other;
 * - the OUT total is the sales report's refunds to the kopeck;
 * - debts / overpayments are an as-of-now snapshot of `orders.balance_kop`,
 *   the same sets the order list's `hasDebt` / `owedToCustomer` return.
 *
 * Every ledger fixture is dated in 2021 so the global aggregates never meet the
 * rows other suites create (they use 2022–2025 or now()); every test removes its
 * own rows. Run with `npm run test:int -w apps/store-api` (DB up + migrated).
 */

const NOW = new Date('2026-09-26T12:00:00Z');

function days(from: string, to: string): ReportRange {
  return resolveReportPeriod({ preset: 'custom', from, to }, NOW).current;
}

const JUN = days('2021-06-01', '2021-06-30');
const JUL = days('2021-07-01', '2021-07-31');
const JAN = days('2021-01-01', '2021-01-31');
const FEB = days('2021-02-01', '2021-02-28');

describe('MoneyFlowRepository (integration, TASK-2395)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: MoneyFlowRepository;
  let sales: SalesRepository;
  let orders: OrderRepository;

  const createdOrderIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createOrder(
    opts: { status?: OrderStatus; balanceKop?: number; deletedAt?: Date } = {},
  ): Promise<string> {
    const order = await prisma.order.create({
      data: {
        guestEmail: `money-flow-${randomUUID()}@test.local`,
        status: opts.status ?? OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 1000,
        total: 1000,
        balanceKop: opts.balanceKop ?? 0,
        deletedAt: opts.deletedAt ?? null,
      },
    });
    createdOrderIds.push(order.id);
    return order.id;
  }

  async function addEntry(
    orderId: string,
    opts: {
      kind: MoneyEntryKind;
      amountKop: number;
      at: string;
      reversalOfId?: string;
      voidedAt?: string;
      providerState?: MoneyProviderState;
      legacy?: boolean;
      actorId?: string;
      reason?: string;
      counterpartOrderId?: string;
    },
  ): Promise<string> {
    const outKinds: MoneyEntryKind[] = [
      MoneyEntryKind.LIQPAY_REFUND,
      MoneyEntryKind.CASH_REFUND,
      MoneyEntryKind.TRANSFER_REFUND,
      MoneyEntryKind.OFFSET_TO_ORDER,
    ];
    const entry = await prisma.orderMoneyEntry.create({
      data: {
        orderId,
        direction: outKinds.includes(opts.kind) ? MoneyDirection.OUT : MoneyDirection.IN,
        kind: opts.kind,
        amountKop: opts.amountKop,
        occurredAt: new Date(opts.at),
        reversalOfId: opts.reversalOfId ?? null,
        voidedAt: opts.voidedAt ? new Date(opts.voidedAt) : null,
        providerState: opts.providerState ?? null,
        legacy: opts.legacy ?? false,
        actorId: opts.actorId ?? null,
        reason: opts.reason ?? (opts.reversalOfId ? 'помилка' : null),
        counterpartOrderId: opts.counterpartOrderId ?? null,
      },
    });
    return entry.id;
  }

  function kindOf(rows: MoneyFlowKindTotals[], kind: MoneyEntryKind) {
    return rows.find((row) => row.kind === kind);
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        MoneyFlowRepository,
        SalesRepository,
        OrderMoneyRepository,
        OrderRepository,
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(MoneyFlowRepository);
    sales = moduleRef.get(SalesRepository);
    orders = moduleRef.get(OrderRepository);

    // The report aggregates the whole ledger, so 2021 must be ours alone.
    const year = { gte: new Date('2020-12-31T00:00:00Z'), lt: new Date('2022-01-02T00:00:00Z') };
    const leftovers = await prisma.orderMoneyEntry.count({ where: { occurredAt: year } });
    if (leftovers > 0) {
      throw new Error(`The test database already holds ${leftovers} ledger rows dated 2021`);
    }
  });

  afterEach(async () => {
    const ids = createdOrderIds.splice(0);
    if (ids.length > 0) {
      // Ledger rows are Restrict on the order and on what they reverse: reversals first.
      await prisma.orderMoneyEntry.deleteMany({
        where: { orderId: { in: ids }, reversalOfId: { not: null } },
      });
      await prisma.orderMoneyEntry.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: ids } } });
    }
    const users = createdUserIds.splice(0);
    if (users.length > 0) await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('dating', () => {
    it('subtracts a reversal on its own (later) day and leaves the earlier period untouched', async () => {
      const orderId = await createOrder();
      const original = await addEntry(orderId, {
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        amountKop: 100_000,
        at: '2021-06-10T10:00:00Z',
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        amountKop: 100_000,
        at: '2021-07-05T10:00:00Z',
        reversalOfId: original,
      });

      expect(kindOf(await repo.getByKind(JUN), MoneyEntryKind.COD_NOVA_POSHTA)).toEqual({
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        direction: MoneyDirection.IN,
        grossKop: 100_000,
        reversedKop: 0,
        netKop: 100_000,
        count: 1,
        requestedKop: 0,
      });
      expect(kindOf(await repo.getByKind(JUL), MoneyEntryKind.COD_NOVA_POSHTA)).toEqual({
        kind: MoneyEntryKind.COD_NOVA_POSHTA,
        direction: MoneyDirection.IN,
        grossKop: 0,
        reversedKop: 100_000,
        netKop: -100_000,
        count: 1,
        requestedKop: 0,
      });
    });

    it('puts 23:30 Kyiv into that Kyiv day and 00:30 Kyiv into the next, whatever UTC says', async () => {
      const orderId = await createOrder();
      // Summer, UTC+3: 20:30Z is 23:30 on 30 June in Kyiv; 21:30Z is 00:30 on 1 July.
      await addEntry(orderId, {
        kind: MoneyEntryKind.PAID_AT_POINT,
        amountKop: 1_111,
        at: '2021-06-30T20:30:00Z',
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.PAID_AT_POINT,
        amountKop: 2_222,
        at: '2021-06-30T21:30:00Z',
      });

      expect(kindOf(await repo.getByKind(JUN), MoneyEntryKind.PAID_AT_POINT)?.grossKop).toBe(1_111);
      expect(kindOf(await repo.getByKind(JUL), MoneyEntryKind.PAID_AT_POINT)?.grossKop).toBe(2_222);
    });

    it('draws the same boundary in winter time, when Kyiv is UTC+2', async () => {
      const orderId = await createOrder();
      // Winter, UTC+2: 21:30Z is 23:30 on 31 January in Kyiv; 22:30Z is 00:30 on 1 February.
      await addEntry(orderId, {
        kind: MoneyEntryKind.PAID_TO_COURIER,
        amountKop: 3_333,
        at: '2021-01-31T21:30:00Z',
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.PAID_TO_COURIER,
        amountKop: 4_444,
        at: '2021-01-31T22:30:00Z',
      });

      expect(kindOf(await repo.getByKind(JAN), MoneyEntryKind.PAID_TO_COURIER)?.grossKop).toBe(
        3_333,
      );
      expect(kindOf(await repo.getByKind(FEB), MoneyEntryKind.PAID_TO_COURIER)?.grossKop).toBe(
        4_444,
      );
    });
  });

  describe('what counts', () => {
    it('leaves voided rows out of the sums and the register', async () => {
      const orderId = await createOrder();
      await addEntry(orderId, {
        kind: MoneyEntryKind.LIQPAY_REFUND,
        amountKop: 40_000,
        at: '2021-06-12T10:00:00Z',
        voidedAt: '2021-06-12T11:00:00Z',
        providerState: MoneyProviderState.REQUESTED,
      });

      expect(kindOf(await repo.getByKind(JUN), MoneyEntryKind.LIQPAY_REFUND)).toBeUndefined();
      expect(await repo.findEntries(JUN, { page: 1, limit: 50 })).toEqual({ rows: [], total: 0 });
    });

    it('leaves a «Залік» pair (TASK-2048) out of the sums and the register', async () => {
      const original = await createOrder();
      const copy = await createOrder();
      await addEntry(original, {
        kind: MoneyEntryKind.BANK_TRANSFER,
        amountKop: 70_000,
        at: '2021-06-10T10:00:00Z',
      });
      // The customer paid once; «Створити копію» carries that money over.
      await addEntry(original, {
        kind: MoneyEntryKind.OFFSET_TO_ORDER,
        amountKop: 70_000,
        at: '2021-06-11T10:00:00Z',
        counterpartOrderId: copy,
      });
      await addEntry(copy, {
        kind: MoneyEntryKind.OFFSET_FROM_ORDER,
        amountKop: 70_000,
        at: '2021-06-11T10:00:00Z',
        counterpartOrderId: original,
      });

      const rows = await repo.getByKind(JUN);
      expect(rows.map((row) => row.kind)).toEqual([MoneyEntryKind.BANK_TRANSFER]);
      expect(kindOf(rows, MoneyEntryKind.BANK_TRANSFER)?.netKop).toBe(70_000);

      const register = await repo.findEntries(JUN, { page: 1, limit: 50 });
      expect(register.total).toBe(1);
      expect(register.rows.map((row) => row.kind)).toEqual([MoneyEntryKind.BANK_TRANSFER]);
      // Even asked for by name, an offset kind has no register rows.
      expect(
        await repo.findEntries(JUN, { page: 1, limit: 50, kind: MoneyEntryKind.OFFSET_TO_ORDER }),
      ).toEqual({ rows: [], total: 0 });
    });

    it('counts a REQUESTED LiqPay refund and reports it apart in requestedKop', async () => {
      const orderId = await createOrder();
      await addEntry(orderId, {
        kind: MoneyEntryKind.LIQPAY_REFUND,
        amountKop: 20_000,
        at: '2021-06-12T10:00:00Z',
        providerState: MoneyProviderState.REQUESTED,
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.LIQPAY_REFUND,
        amountKop: 5_000,
        at: '2021-06-13T10:00:00Z',
        providerState: MoneyProviderState.CONFIRMED,
      });

      expect(kindOf(await repo.getByKind(JUN), MoneyEntryKind.LIQPAY_REFUND)).toEqual({
        kind: MoneyEntryKind.LIQPAY_REFUND,
        direction: MoneyDirection.OUT,
        grossKop: 25_000,
        reversedKop: 0,
        netKop: 25_000,
        count: 2,
        requestedKop: 20_000,
      });
    });

    it('counts a legacy (backfilled) row exactly once', async () => {
      const orderId = await createOrder();
      await addEntry(orderId, {
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop: 7_700,
        at: '2021-06-20T10:00:00Z',
        legacy: true,
      });

      expect(kindOf(await repo.getByKind(JUN), MoneyEntryKind.CASH_REFUND)).toMatchObject({
        grossKop: 7_700,
        netKop: 7_700,
        count: 1,
      });
      const { rows } = await repo.findEntries(JUN, { page: 1, limit: 50 });
      expect(rows.map((row) => [row.amountKop, row.legacy])).toEqual([[7_700, true]]);
    });

    it('gives the same OUT total as the sales report’s refunds, to the kopeck', async () => {
      const orderId = await createOrder();
      const cash = await addEntry(orderId, {
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop: 30_005,
        at: '2021-06-05T10:00:00Z',
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop: 30_005,
        at: '2021-07-02T10:00:00Z',
        reversalOfId: cash,
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.TRANSFER_REFUND,
        amountKop: 12_345,
        at: '2021-06-30T20:59:00Z',
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.LIQPAY_REFUND,
        amountKop: 9_999,
        at: '2021-07-15T10:00:00Z',
        providerState: MoneyProviderState.REQUESTED,
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.LIQPAY_REFUND,
        amountKop: 50_000,
        at: '2021-07-16T10:00:00Z',
        voidedAt: '2021-07-16T11:00:00Z',
      });
      // An IN row must not leak into the OUT side.
      await addEntry(orderId, {
        kind: MoneyEntryKind.BANK_TRANSFER,
        amountKop: 100_000,
        at: '2021-06-01T10:00:00Z',
      });

      for (const range of [JUN, JUL]) {
        const outKop = (await repo.getByKind(range))
          .filter((row) => row.direction === MoneyDirection.OUT)
          .reduce((sum, row) => sum + row.netKop, 0);
        const { refunds } = await sales.getTotals(range);
        expect(outKop).toBe(Math.round(refunds * 100));
      }
      // And the numbers themselves, so the equality is not 0 = 0.
      const junOut = (await repo.getByKind(JUN)).filter((r) => r.direction === MoneyDirection.OUT);
      expect(junOut.reduce((sum, row) => sum + row.netKop, 0)).toBe(42_350);
      const julOut = (await repo.getByKind(JUL)).filter((r) => r.direction === MoneyDirection.OUT);
      expect(julOut.reduce((sum, row) => sum + row.netKop, 0)).toBe(9_999 - 30_005);
    });
  });

  describe('the register', () => {
    it('lists live entries oldest first, signs reversals, names the operator and the order', async () => {
      const actor = await prisma.user.create({
        data: {
          email: `money-flow-actor-${randomUUID()}@test.local`,
          firstName: 'Олена',
          lastName: 'Коваль',
          role: 'MANAGER',
        },
      });
      createdUserIds.push(actor.id);
      const orderId = await createOrder();
      const original = await addEntry(orderId, {
        kind: MoneyEntryKind.PAID_TO_COURIER,
        amountKop: 50_000,
        at: '2021-06-03T10:00:00Z',
        actorId: actor.id,
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.PAID_TO_COURIER,
        amountKop: 50_000,
        at: '2021-06-04T10:00:00Z',
        reversalOfId: original,
        actorId: actor.id,
        reason: 'не та сума',
      });
      await addEntry(orderId, {
        kind: MoneyEntryKind.LIQPAY_REFUND,
        amountKop: 1_000,
        at: '2021-06-02T10:00:00Z',
        providerState: MoneyProviderState.REQUESTED,
      });

      const { rows, total } = await repo.findEntries(JUN, { page: 1, limit: 50 });

      expect(total).toBe(3);
      expect(rows.map((row) => [row.kind, row.signedKop, row.isReversal])).toEqual([
        [MoneyEntryKind.LIQPAY_REFUND, 1_000, false],
        [MoneyEntryKind.PAID_TO_COURIER, 50_000, false],
        [MoneyEntryKind.PAID_TO_COURIER, -50_000, true],
      ]);
      expect(rows[0]).toMatchObject({
        orderId,
        orderNumber: orderId.slice(0, 8).toUpperCase(),
        direction: MoneyDirection.OUT,
        providerState: MoneyProviderState.REQUESTED,
        actorName: null,
      });
      expect(rows[2]).toMatchObject({
        actorName: 'Олена Коваль',
        reason: 'не та сума',
        reversalOfId: original,
        amountKop: 50_000,
      });
    });

    it('filters by kind and pages, keeping the total of the whole selection', async () => {
      const orderId = await createOrder();
      for (let day = 1; day <= 5; day += 1) {
        await addEntry(orderId, {
          kind: MoneyEntryKind.BANK_TRANSFER,
          amountKop: day * 100,
          at: `2021-06-0${day}T10:00:00Z`,
        });
      }
      await addEntry(orderId, {
        kind: MoneyEntryKind.CASH_REFUND,
        amountKop: 999,
        at: '2021-06-03T12:00:00Z',
      });

      const page = await repo.findEntries(JUN, {
        kind: MoneyEntryKind.BANK_TRANSFER,
        page: 2,
        limit: 2,
      });

      expect(page.total).toBe(5);
      expect(page.rows.map((row) => row.amountKop)).toEqual([300, 400]);
    });
  });

  describe('balances — as of now', () => {
    it('counts DELIVERED debts and any-status overpayments, the sets the order list filters return', async () => {
      const before = await repo.getBalances();

      const debt = await createOrder({ status: OrderStatus.DELIVERED, balanceKop: 15_000 });
      // Owes, but not delivered: not a «Борг».
      const notDelivered = await createOrder({ status: OrderStatus.CONFIRMED, balanceKop: 9_000 });
      const owedCancelled = await createOrder({
        status: OrderStatus.CANCELLED,
        balanceKop: -2_500,
      });
      const owedDelivered = await createOrder({ status: OrderStatus.DELIVERED, balanceKop: -500 });
      const settled = await createOrder({ status: OrderStatus.DELIVERED, balanceKop: 0 });
      // Soft-deleted (audit tombstone): out of the balances and out of both chips.
      const deletedDebt = await createOrder({
        status: OrderStatus.DELIVERED,
        balanceKop: 70_000,
        deletedAt: new Date(),
      });
      const deletedOwed = await createOrder({
        status: OrderStatus.CANCELLED,
        balanceKop: -80_000,
        deletedAt: new Date(),
      });

      const after = await repo.getBalances();
      expect(after.debt.orders - before.debt.orders).toBe(1);
      expect(after.debt.kop - before.debt.kop).toBe(15_000);
      expect(after.owedToCustomer.orders - before.owedToCustomer.orders).toBe(2);
      expect(after.owedToCustomer.kop - before.owedToCustomer.kop).toBe(3_000);

      const mine = new Set([
        debt,
        notDelivered,
        owedCancelled,
        owedDelivered,
        settled,
        deletedDebt,
        deletedOwed,
      ]);
      const listed = async (query: { hasDebt?: boolean; owedToCustomer?: boolean }) =>
        (await orders.findAll({ ...query, limit: 100 })).orders
          .map((row) => row.id)
          .filter((id) => mine.has(id))
          .sort();

      expect(await listed({ owedToCustomer: true })).toEqual([owedCancelled, owedDelivered].sort());
      expect(await listed({ hasDebt: true })).toEqual([debt]);
    });
  });
});
