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
  /** The optimistic-lock token the lock returns (R2 A3); defaults to {@link LEDGER_ORDER_UPDATED_AT}. */
  updatedAt?: Date;
}

/** The order row's `updated_at` unless a suite sets its own. */
export const LEDGER_ORDER_UPDATED_AT = new Date('2026-11-01T10:00:00.000Z');

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
          updated_at: o.updatedAt ?? LEDGER_ORDER_UPDATED_AT,
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
    /**
     * `recompute` reads Σ return credit, the operator's payout rules (R2 A3)
     * read the order's returns — no returns in these suites.
     */
    return: {
      aggregate: jest.fn(async () => ({ _sum: { creditKop: null } })),
      findMany: jest.fn(async () => []),
    },
  };

  /**
   * `OrderMoneyRepository.findSnapshot` (R2 A3): the order with its entries as
   * the operator's money view reads them. Spread into the suite's `order` mock.
   */
  const findSnapshot = jest.fn(async () => {
    const o = order();
    const rows = [...entries].sort(
      (a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime(),
    );
    const sum = (direction: string) =>
      rows
        .filter((row) => row.direction === direction && row.voidedAt === null)
        .reduce(
          (total, row) => total + (row.reversalOfId === null ? 1 : -1) * (row.amountKop as number),
          0,
        );
    return {
      id: o.id,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      deliveryMethod: o.deliveryMethod,
      total: new Prisma.Decimal(o.total),
      paidKop: sum('IN'),
      refundedKop: sum('OUT'),
      returnCreditKop: 0,
      balanceKop: 0,
      updatedAt: o.updatedAt ?? LEDGER_ORDER_UPDATED_AT,
      moneyEntries: rows.map((row) => ({
        returnId: null,
        paymentId: null,
        providerRef: null,
        providerState: null,
        actorId: null,
        reason: null,
        occurredAt: row.createdAt,
        ...row,
        actor: null,
        reversedBy: null,
      })),
      returns: [],
    };
  });

  return {
    prisma,
    entries,
    findSnapshot,
    /** Forget every entry and call (call from `beforeEach`). */
    reset(): void {
      entries.length = 0;
      sequence = 0;
    },
  };
}
