import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { CacheService } from '../src/cache';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * «Борг» and «unpaid in transit» read the money ledger (R2 A4, TASK-2047) —
 * against a REAL Postgres, with balances written by the real recompute.
 *
 * - «Борг» (`hasDebt`) = DELIVERED ∧ `balanceKop > 0`: a partly paid delivered
 *   order is a debt; a delivered order with one line refunded and nothing owed
 *   is not (AD-RET-17 «Борг 2 297 ₴» next to «Частково повернуто»).
 * - «unpaid in transit» = not CANCELLED/REFUNDED ∧ `balanceKop > 0`.
 *
 * The dashboard's twin predicate (`DashboardRepository.unrealizedOrderWhere`) is
 * the same condition — pinned by `dashboard.repository.int-spec.ts`.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('Debt and unpaid-in-transit from the ledger (integration, R2 A4)', () => {
  let prisma: PrismaService;
  let orders: OrderRepository;
  let money: OrderMoneyRepository;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
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
    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrderRepository);
    money = moduleRef.get(OrderMoneyRepository);
    await prisma.$connect();

    const tag = randomUUID().slice(0, 8);
    /** A 1 000 ₴ cash-on-delivery order with `inKop` received and `outKop` paid back. */
    const seed = async (key: string, status: OrderStatus, inKop: number, outKop = 0) => {
      const order = await prisma.order.create({
        data: {
          guestEmail: `debt-${key}-${tag}@test.local`,
          status,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: PaymentMethod.ON_DELIVERY,
          deliveryMethod: DeliveryMethod.NOVA_POSHTA,
          subtotal: 1000,
          total: 1000,
        },
      });
      const entry = (direction: MoneyDirection, kind: MoneyEntryKind, amountKop: number) =>
        prisma.orderMoneyEntry.create({
          data: { orderId: order.id, direction, kind, amountKop, occurredAt: new Date() },
        });
      if (inKop > 0) await entry(MoneyDirection.IN, MoneyEntryKind.COD_NOVA_POSHTA, inKop);
      if (outKop > 0) await entry(MoneyDirection.OUT, MoneyEntryKind.CASH_REFUND, outKop);
      await money.transaction(order.id, (tx) => money.recompute(tx, order.id, null));
      ids[key] = order.id;
    };

    await seed('deliveredUnpaid', OrderStatus.DELIVERED, 0);
    await seed('deliveredHalfPaid', OrderStatus.DELIVERED, 50_000);
    await seed('deliveredPaid', OrderStatus.DELIVERED, 100_000);
    // Paid in full, 100 ₴ sent back WITHOUT a return credit: the shop now owes
    // nothing back and the customer owes 100 ₴ — still a debt, by the balance.
    await seed('deliveredPartRefunded', OrderStatus.DELIVERED, 100_000, 10_000);
    await seed('confirmedHalfPaid', OrderStatus.CONFIRMED, 50_000);
    await seed('confirmedPaid', OrderStatus.CONFIRMED, 100_000);
    await seed('cancelledUnpaid', OrderStatus.CANCELLED, 0);
  });

  afterAll(async () => {
    const all = Object.values(ids);
    await prisma.orderMoneyEntry.deleteMany({ where: { orderId: { in: all } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: all } } });
    await prisma.order.deleteMany({ where: { id: { in: all } } });
    await prisma.$disconnect();
  });

  const mine = async (query: { hasDebt?: boolean; unpaidInTransit?: boolean }) => {
    const { orders: rows } = await orders.findAll({ ...query, limit: 100 });
    const wanted = new Set(Object.values(ids));
    const keyOf = Object.fromEntries(Object.entries(ids).map(([key, id]) => [id, key]));
    return rows
      .filter((row) => wanted.has(row.id))
      .map((row) => keyOf[row.id])
      .sort();
  };

  it('writes the balances the filters read', async () => {
    const balance = async (key: string) =>
      (await prisma.order.findUniqueOrThrow({ where: { id: ids[key] } })).balanceKop;
    expect(await balance('deliveredUnpaid')).toBe(100_000);
    expect(await balance('deliveredHalfPaid')).toBe(50_000);
    expect(await balance('deliveredPaid')).toBe(0);
    expect(await balance('deliveredPartRefunded')).toBe(10_000);
    expect(await balance('cancelledUnpaid')).toBe(0);
  });

  it('«Борг» is DELIVERED with a positive balance — partly paid included', async () => {
    expect(await mine({ hasDebt: true })).toEqual(
      ['deliveredHalfPaid', 'deliveredPartRefunded', 'deliveredUnpaid'].sort(),
    );
  });

  it('«unpaid in transit» is every live order still owed money', async () => {
    expect(await mine({ unpaidInTransit: true })).toEqual(
      ['confirmedHalfPaid', 'deliveredHalfPaid', 'deliveredPartRefunded', 'deliveredUnpaid'].sort(),
    );
  });
});
