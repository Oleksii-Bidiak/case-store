import {
  Prisma,
  type DeliveryMethod,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@prisma/client';

/**
 * An in-memory `order_money_entries` table for the e2e suites that run the
 * whole payment chain over a mocked `PrismaService` (R2 A2, TASK-1500 /
 * TASK-2047). Since the webhook writes money through `OrderMoneyRepository`,
 * those suites need the ledger's few queries to answer like Postgres would:
 * the order-row lock (`$queryRaw`), the entry reads/writes, and the inputs
 * `recompute` reads. Spread the returned `prisma` part into the suite's own
 * `prismaServiceMock`, and assert on `entries` — what would have been written.
 *
 * Deliberately small: equality, `{ in: [...] }` and `{ lte }` filters only —
 * exactly what the ledger code asks. Anything else is a test bug, not a feature.
 */
export interface LedgerOrderState {
  id: string;
  /** Decimal string, e.g. "1249.00". */
  total: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
}

export type LedgerRow = Record<string, unknown> & { id: string };

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key] ?? null;
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const filter = expected as { in?: unknown[]; lte?: Date };
      if (filter.in) return filter.in.includes(actual);
      if (filter.lte) return actual instanceof Date && actual <= filter.lte;
      return false;
    }
    return actual === (expected ?? null);
  });
}

export function createLedgerPrismaMock(order: () => LedgerOrderState) {
  const entries: LedgerRow[] = [];
  let sequence = 0;

  const prisma = {
    /**
     * `OrderMoneyRepository.lockOrder` — `SELECT … FOR UPDATE` of the order row.
     * Any other raw query (a suite may have its own) answers no rows.
     */
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      if (!strings.join('').includes('FROM "orders"')) return [];
      const o = order();
      return [
        {
          id: o.id,
          total: new Prisma.Decimal(o.total),
          status: o.status,
          payment_status: o.paymentStatus,
          payment_method: o.paymentMethod,
          delivery_method: o.deliveryMethod,
        },
      ];
    }),
    orderMoneyEntry: {
      findUnique: jest.fn(
        async ({ where }: { where: { paymentId_providerRef: Where } }) =>
          entries.find((row) => matches(row, where.paymentId_providerRef)) ?? null,
      ),
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        entries.filter((row) => matches(row, where)),
      ),
      findFirst: jest.fn(
        async ({ where }: { where: Where }) => entries.find((row) => matches(row, where)) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        sequence += 1;
        const row: LedgerRow = {
          id: `entry-${sequence}`,
          reversalOfId: null,
          voidedAt: null,
          voidReason: null,
          legacy: false,
          createdAt: new Date(Date.now() + sequence),
          ...data,
        };
        entries.push(row);
        return row;
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
          const hits = entries.filter((row) => matches(row, where));
          hits.forEach((row) => Object.assign(row, data));
          return { count: hits.length };
        },
      ),
    },
    /** `recompute` reads Σ return credit — no returns in these suites. */
    return: { aggregate: jest.fn(async () => ({ _sum: { creditKop: null } })) },
  };

  return {
    prisma,
    entries,
    /** Forget every entry and call (call from `beforeEach`). */
    reset(): void {
      entries.length = 0;
      sequence = 0;
    },
  };
}
