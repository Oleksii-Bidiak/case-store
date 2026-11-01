import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../src/prisma';
import { allocateReturnCredit, unitsCreditKop } from '../src/order/order-money';

/**
 * The R2 money-ledger backfill (TASK-2047 / TASK-2046 / TASK-951; plan §2),
 * against a REAL Postgres.
 *
 * ── What it must do ─────────────────────────────────────────────────────────
 * `20261101130000_order_money_backfill` turns the four pre-ledger money sources
 * into `order_money_entries`:
 *   - IN: a settled LiqPay attempt → LIQPAY_PAYMENT; a paid label without one →
 *     the total, kind by delivery;
 *   - OUT: R (returns), P (provider), F (IN on a REFUNDED label) → max(F, R, P),
 *     never the sum — the two journals may have recorded the same money twice
 *     (TASK-951) — and never more than came in;
 *   - PARTIALLY_REFUNDED with no amount anywhere → no entry, a
 *     LEGACY_MONEY_UNKNOWN history flag;
 *   - an ORDER in status REFUNDED with no money in, or reached from CANCELLED →
 *     CANCELLED;
 *   - the four totals on `orders` and `returns.credit_kop`.
 *
 * ── How ─────────────────────────────────────────────────────────────────────
 * Same as test/return-backfill.int-spec.ts: `store_test` is already migrated, so
 * the hand-written section between the BACKFILL markers is read off the shipped
 * `.sql` and executed as written inside a transaction that is rolled back. The
 * VERIFY section is a single `DO $$ … $$` block and is executed as ONE statement.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */

const MIGRATION_SQL = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20261101130000_order_money_backfill',
  'migration.sql',
);

function section(begin: string, end: string): string {
  const sql = readFileSync(MIGRATION_SQL, 'utf8');
  const from = sql.indexOf(begin);
  const to = sql.indexOf(end);
  if (from < 0 || to < 0 || to < from) {
    throw new Error(`Expected "${begin}" … "${end}" markers in ${MIGRATION_SQL}`);
  }
  return sql.slice(from + begin.length, to);
}

/** The hand-written BACKFILL statements, one command each. */
function backfillStatements(): string[] {
  return section('-- BACKFILL:BEGIN', '-- BACKFILL:END')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** The VERIFY block — a single DO statement, never split. */
function verifyStatement(): string {
  return section('-- VERIFY:BEGIN', '-- VERIFY:END').trim();
}

type Tx = Prisma.TransactionClient;

const ROLLBACK = new Error('rollback');

interface EntryRow {
  direction: string;
  kind: string;
  amount_kop: number;
  return_id: string | null;
  payment_id: string | null;
  provider_ref: string | null;
  provider_state: string | null;
  legacy: boolean;
}

interface OrderMoneyRow {
  status: string;
  payment_status: string;
  paid_kop: number;
  refunded_kop: number;
  return_credit_kop: number;
  balance_kop: number;
}

describe('Order money backfill (TASK-2047/2046/951) — integration', () => {
  let prisma: PrismaService;
  const statements = backfillStatements();
  const verify = verifyStatement();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function inRolledBackTx(body: (tx: Tx) => Promise<void>): Promise<void> {
    await prisma
      .$transaction(
        async (tx) => {
          await body(tx);
          throw ROLLBACK;
        },
        { timeout: 120_000, maxWait: 20_000 },
      )
      .catch((error: unknown) => {
        if (error !== ROLLBACK) {
          throw error;
        }
      });
  }

  async function runBackfill(tx: Tx): Promise<void> {
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
  }

  async function runVerify(tx: Tx): Promise<void> {
    await tx.$executeRawUnsafe(verify);
  }

  interface LegacyOrder {
    total: string;
    paymentStatus?: string;
    status?: string;
    paymentMethod?: string;
    deliveryMethod?: string;
    discount?: string;
    paidAt?: string | null;
  }

  /** An order shaped like one written before R2 (money columns at their defaults). */
  async function insertOrder(tx: Tx, input: LegacyOrder): Promise<string> {
    const id = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "orders" ("id", "status", "payment_status", "payment_method", "delivery_method",
         "subtotal", "discount", "total", "shipping_address", "paid_at", "updated_at")
       VALUES ($1, $2::"OrderStatus", $3::"PaymentStatus", $4::"PaymentMethod", $5::"DeliveryMethod",
         $6::numeric, $7::numeric, $6::numeric, '{"city":"Київ"}'::jsonb, $8::timestamp,
         '2026-09-02T10:00:00Z')`,
      id,
      input.status ?? 'DELIVERED',
      input.paymentStatus ?? 'PENDING',
      input.paymentMethod ?? 'ON_DELIVERY',
      input.deliveryMethod ?? 'NOVA_POSHTA',
      input.total,
      input.discount ?? '0',
      input.paidAt ?? null,
    );
    return id;
  }

  async function insertPayment(
    tx: Tx,
    input: { orderId: string; amount: string; status: string; refundedAmount?: string },
  ): Promise<string> {
    const id = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "payments" ("id", "order_id", "provider", "amount", "refunded_amount", "status",
         "settled_at", "updated_at")
       VALUES ($1, $2, 'liqpay', $3::numeric, $4::numeric, $5::"PaymentAttemptStatus",
         '2026-09-01T12:00:00Z', '2026-09-03T12:00:00Z')`,
      id,
      input.orderId,
      input.amount,
      input.refundedAmount ?? '0',
      input.status,
    );
    return id;
  }

  async function insertReturn(
    tx: Tx,
    input: {
      orderId: string;
      refundedAmount?: string | null;
      decision?: string | null;
      requestedAt?: string;
    },
  ): Promise<string> {
    const id = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "returns" ("id", "order_id", "status", "refunded_amount", "decision",
         "requested_at", "resolved_at", "updated_at")
       VALUES ($1, $2, 'REFUNDED', $3::numeric, $4::"ReturnDecision", $5::timestamp,
         '2026-09-04T10:00:00Z', '2026-09-04T10:00:00Z')`,
      id,
      input.orderId,
      input.refundedAmount ?? null,
      input.decision ?? null,
      input.requestedAt ?? '2026-09-03T10:00:00Z',
    );
    return id;
  }

  async function insertStatusHistory(
    tx: Tx,
    orderId: string,
    from: string | null,
    to: string,
    at: string,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO "order_status_history" ("id", "order_id", "change_type", "from_status", "to_status", "changed_at")
       VALUES ($1, $2, 'STATUS', $3::"OrderStatus", $4::"OrderStatus", $5::timestamp)`,
      randomUUID(),
      orderId,
      from,
      to,
      at,
    );
  }

  async function entriesOf(tx: Tx, orderId: string): Promise<EntryRow[]> {
    return tx.$queryRawUnsafe<EntryRow[]>(
      `SELECT "direction"::text, "kind"::text, "amount_kop", "return_id", "payment_id",
              "provider_ref", "provider_state"::text, "legacy"
         FROM "order_money_entries" WHERE "order_id" = $1
        ORDER BY "direction", "amount_kop" DESC, "kind"`,
      orderId,
    );
  }

  async function orderOf(tx: Tx, orderId: string): Promise<OrderMoneyRow> {
    const [row] = await tx.$queryRawUnsafe<OrderMoneyRow[]>(
      `SELECT "status"::text, "payment_status"::text, "paid_kop", "refunded_kop",
              "return_credit_kop", "balance_kop"
         FROM "orders" WHERE "id" = $1`,
      orderId,
    );
    return row;
  }

  async function notesOf(tx: Tx, orderId: string): Promise<Array<{ note: string | null }>> {
    return tx.$queryRawUnsafe(
      `SELECT "note"::text FROM "order_status_history" WHERE "order_id" = $1 AND "note" IS NOT NULL`,
      orderId,
    );
  }

  it('extracts the hand-written statements and one VERIFY block from the shipped migration', () => {
    expect(statements.length).toBeGreaterThan(5);
    expect(verify.startsWith('DO $$')).toBe(true);
  });

  describe('IN', () => {
    it('a settled LiqPay attempt is one LIQPAY_PAYMENT keyed by the attempt', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '1299.00',
          paymentStatus: 'PAID',
          paymentMethod: 'ONLINE',
        });
        const paymentId = await insertPayment(tx, {
          orderId,
          amount: '1299.00',
          status: 'SUCCEEDED',
        });
        await insertPayment(tx, { orderId, amount: '1299.00', status: 'FAILED' });

        await runBackfill(tx);

        expect(await entriesOf(tx, orderId)).toEqual([
          expect.objectContaining({
            direction: 'IN',
            kind: 'LIQPAY_PAYMENT',
            amount_kop: 129_900,
            payment_id: paymentId,
            provider_ref: 'success',
            legacy: true,
          }),
        ]);
        expect(await orderOf(tx, orderId)).toMatchObject({
          paid_kop: 129_900,
          refunded_kop: 0,
          balance_kop: 0,
        });
      });
    });

    it.each([
      ['NOVA_POSHTA', 'COD_NOVA_POSHTA'],
      ['PICKUP', 'PAID_AT_POINT'],
      ['COURIER', 'PAID_TO_COURIER'],
      ['OTHER', 'BANK_TRANSFER'],
    ])('a PAID label without an attempt on %s is the total as %s', async (delivery, kind) => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '500.50',
          paymentStatus: 'PAID',
          deliveryMethod: delivery,
        });

        await runBackfill(tx);

        expect(await entriesOf(tx, orderId)).toEqual([
          expect.objectContaining({ direction: 'IN', kind, amount_kop: 50_050, legacy: true }),
        ]);
      });
    });

    it('an unpaid order gets no entry and owes its total', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, { total: '250.00', paymentStatus: 'PENDING' });

        await runBackfill(tx);

        expect(await entriesOf(tx, orderId)).toEqual([]);
        expect(await orderOf(tx, orderId)).toMatchObject({ paid_kop: 0, balance_kop: 25_000 });
      });
    });
  });

  describe('OUT', () => {
    it('R only: one payout per return, linked to it', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '1000.00',
          paymentStatus: 'PARTIALLY_REFUNDED',
        });
        const returnId = await insertReturn(tx, { orderId, refundedAmount: '300.00' });

        await runBackfill(tx);

        const entries = await entriesOf(tx, orderId);
        expect(entries).toEqual([
          expect.objectContaining({ direction: 'IN', amount_kop: 100_000 }),
          expect.objectContaining({
            direction: 'OUT',
            kind: 'TRANSFER_REFUND',
            amount_kop: 30_000,
            return_id: returnId,
          }),
        ]);
        expect(await orderOf(tx, orderId)).toMatchObject({
          paid_kop: 100_000,
          refunded_kop: 30_000,
        });
      });
    });

    it('P only: the provider refund is a confirmed LIQPAY_REFUND on its attempt', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '1000.00',
          paymentStatus: 'PARTIALLY_REFUNDED',
          paymentMethod: 'ONLINE',
        });
        const paymentId = await insertPayment(tx, {
          orderId,
          amount: '1000.00',
          status: 'SUCCEEDED',
          refundedAmount: '400.00',
        });

        await runBackfill(tx);

        expect((await entriesOf(tx, orderId)).filter((e) => e.direction === 'OUT')).toEqual([
          expect.objectContaining({
            kind: 'LIQPAY_REFUND',
            amount_kop: 40_000,
            payment_id: paymentId,
            provider_ref: 'legacy-refund',
            provider_state: 'CONFIRMED',
          }),
        ]);
      });
    });

    it.each([
      ['P larger', '300.00', '500.00', [30_000, 20_000]],
      ['R larger', '500.00', '300.00', [50_000]],
      ['equal', '400.00', '400.00', [40_000]],
    ])('R ∩ P (%s): the maximum, never the sum', async (_label, r, p, expectedOut) => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '1000.00',
          paymentStatus: 'PARTIALLY_REFUNDED',
          paymentMethod: 'ONLINE',
        });
        await insertPayment(tx, {
          orderId,
          amount: '1000.00',
          status: 'SUCCEEDED',
          refundedAmount: p,
        });
        await insertReturn(tx, { orderId, refundedAmount: r });

        await runBackfill(tx);

        const out = (await entriesOf(tx, orderId)).filter((e) => e.direction === 'OUT');
        expect(out.map((e) => e.amount_kop)).toEqual(expectedOut);
        const max = Math.max(Number(r), Number(p)) * 100;
        expect((await orderOf(tx, orderId)).refunded_kop).toBe(max);
      });
    });

    it('a REFUNDED attempt refunds its whole amount', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '800.00',
          paymentStatus: 'REFUNDED',
          status: 'CANCELLED',
          paymentMethod: 'ONLINE',
        });
        await insertPayment(tx, { orderId, amount: '800.00', status: 'REFUNDED' });

        await runBackfill(tx);

        const entries = await entriesOf(tx, orderId);
        expect(entries.map((e) => [e.direction, e.kind, e.amount_kop])).toEqual([
          ['IN', 'LIQPAY_PAYMENT', 80_000],
          ['OUT', 'LIQPAY_REFUND', 80_000],
        ]);
      });
    });

    it.each([
      ['NOVA_POSHTA', 'TRANSFER_REFUND'],
      ['PICKUP', 'CASH_REFUND'],
    ])(
      'REFUNDED label without an amount (%s): the residual up to IN as %s',
      async (delivery, kind) => {
        await inRolledBackTx(async (tx) => {
          const orderId = await insertOrder(tx, {
            total: '1000.00',
            paymentStatus: 'REFUNDED',
            status: 'DELIVERED',
            deliveryMethod: delivery,
          });
          await insertReturn(tx, { orderId, refundedAmount: '250.00' });

          await runBackfill(tx);

          const out = (await entriesOf(tx, orderId)).filter((e) => e.direction === 'OUT');
          expect(out.map((e) => [e.kind, e.amount_kop, e.return_id === null])).toEqual([
            [kind, 75_000, true],
            [kind, 25_000, false],
          ]);
          expect(await orderOf(tx, orderId)).toMatchObject({
            paid_kop: 100_000,
            refunded_kop: 100_000,
          });
        });
      },
    );

    it('caps refunds at what came in (cumulatively across returns)', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, { total: '1000.00', paymentStatus: 'PAID' });
        await insertReturn(tx, {
          orderId,
          refundedAmount: '700.00',
          requestedAt: '2026-09-03T10:00:00Z',
        });
        await insertReturn(tx, {
          orderId,
          refundedAmount: '700.00',
          requestedAt: '2026-09-03T11:00:00Z',
        });
        // No money in at all: nothing may go out.
        const unpaidId = await insertOrder(tx, { total: '400.00', paymentStatus: 'PENDING' });
        await insertReturn(tx, { orderId: unpaidId, refundedAmount: '100.00' });

        await runBackfill(tx);

        const out = (await entriesOf(tx, orderId)).filter((e) => e.direction === 'OUT');
        expect(out.map((e) => e.amount_kop)).toEqual([70_000, 30_000]);
        expect(await orderOf(tx, orderId)).toMatchObject({
          paid_kop: 100_000,
          refunded_kop: 100_000,
        });
        expect(await entriesOf(tx, unpaidId)).toEqual([]);
      });
    });
  });

  describe('flags', () => {
    it('PARTIALLY_REFUNDED with no amount anywhere: no OUT entry, a LEGACY_MONEY_UNKNOWN note', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '600.00',
          paymentStatus: 'PARTIALLY_REFUNDED',
        });

        await runBackfill(tx);

        const entries = await entriesOf(tx, orderId);
        expect(entries.map((e) => e.direction)).toEqual(['IN']);
        expect(await notesOf(tx, orderId)).toEqual([{ note: 'LEGACY_MONEY_UNKNOWN' }]);
        expect(await orderOf(tx, orderId)).toMatchObject({
          payment_status: 'PARTIALLY_REFUNDED',
          paid_kop: 60_000,
          refunded_kop: 0,
        });
      });
    });

    it('an order REFUNDED from CANCELLED becomes CANCELLED, money kept, with a history row', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '900.00',
          paymentStatus: 'REFUNDED',
          status: 'REFUNDED',
        });
        await insertStatusHistory(tx, orderId, null, 'PENDING', '2026-09-01T09:00:00Z');
        await insertStatusHistory(tx, orderId, 'PENDING', 'CANCELLED', '2026-09-01T10:00:00Z');
        await insertStatusHistory(tx, orderId, 'CANCELLED', 'REFUNDED', '2026-09-01T11:00:00Z');

        await runBackfill(tx);

        expect(await orderOf(tx, orderId)).toMatchObject({
          status: 'CANCELLED',
          paid_kop: 90_000,
          refunded_kop: 90_000,
          balance_kop: 0,
        });
        const rows = await tx.$queryRawUnsafe<
          Array<{ from_status: string; changed_by: string | null }>
        >(
          `SELECT "from_status"::text, "changed_by" FROM "order_status_history"
            WHERE "order_id" = $1 AND "to_status" = 'CANCELLED' AND "from_status" = 'REFUNDED'`,
          orderId,
        );
        expect(rows).toEqual([{ from_status: 'REFUNDED', changed_by: null }]);
      });
    });

    it('an order REFUNDED with no money in becomes CANCELLED', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '900.00',
          paymentStatus: 'PENDING',
          status: 'REFUNDED',
        });

        await runBackfill(tx);

        expect(await orderOf(tx, orderId)).toMatchObject({
          status: 'CANCELLED',
          paid_kop: 0,
          balance_kop: 0,
        });
      });
    });

    it('a paid order REFUNDED from DELIVERED stays REFUNDED', async () => {
      await inRolledBackTx(async (tx) => {
        const orderId = await insertOrder(tx, {
          total: '900.00',
          paymentStatus: 'REFUNDED',
          status: 'REFUNDED',
        });
        await insertStatusHistory(tx, orderId, 'DELIVERED', 'REFUNDED', '2026-09-01T11:00:00Z');

        await runBackfill(tx);

        expect(await orderOf(tx, orderId)).toMatchObject({ status: 'REFUNDED', balance_kop: 0 });
      });
    });
  });

  describe('return credit', () => {
    it('REFUND-decided returns get the goods minus their promo share, as order-money.ts computes it', async () => {
      await inRolledBackTx(async (tx) => {
        const suffix = randomUUID().slice(0, 8);
        const category = await tx.category.create({
          data: { name: `money-cat-${suffix}`, slug: `money-cat-${suffix}` },
        });
        const product = await tx.product.create({
          data: {
            name: `money-prod-${suffix}`,
            slug: `money-prod-${suffix}`,
            price: 100,
            stock: 10,
            categoryId: category.id,
          },
        });
        const orderId = await insertOrder(tx, {
          total: '1083.33',
          discount: '100.01',
          paymentStatus: 'PAID',
        });
        const lineSpecs = [
          { price: '333.33', quantity: 3, at: '2026-09-01T10:00:01Z' },
          { price: '183.34', quantity: 1, at: '2026-09-01T10:00:02Z' },
        ];
        const itemIds: string[] = [];
        for (const line of lineSpecs) {
          const id = randomUUID();
          itemIds.push(id);
          await tx.$executeRawUnsafe(
            `INSERT INTO "order_items" ("id", "order_id", "product_id", "quantity", "price", "created_at")
             VALUES ($1, $2, $3, $4, $5::numeric, $6::timestamp)`,
            id,
            orderId,
            product.id,
            line.quantity,
            line.price,
            line.at,
          );
        }
        const first = await insertReturn(tx, {
          orderId,
          decision: 'REFUND',
          requestedAt: '2026-09-03T10:00:00Z',
        });
        const second = await insertReturn(tx, {
          orderId,
          decision: 'REFUND',
          requestedAt: '2026-09-03T11:00:00Z',
        });
        const rejected = await insertReturn(tx, {
          orderId,
          decision: 'REJECT',
          requestedAt: '2026-09-03T12:00:00Z',
        });
        const addItem = (returnId: string, orderItemId: string, quantity: number) =>
          tx.$executeRawUnsafe(
            `INSERT INTO "return_items" ("id", "return_id", "order_item_id", "quantity")
             VALUES ($1, $2, $3, $4)`,
            randomUUID(),
            returnId,
            orderItemId,
            quantity,
          );
        await addItem(first, itemIds[0], 1);
        await addItem(first, itemIds[1], 1);
        await addItem(second, itemIds[0], 2);
        await addItem(rejected, itemIds[0], 1);

        await runBackfill(tx);

        const net = allocateReturnCredit(
          lineSpecs.map((l) => ({ grossKop: Math.round(Number(l.price) * 100) * l.quantity })),
          10_001,
        );
        const expectedFirst = unitsCreditKop(net[0], 3, 0, 1) + unitsCreditKop(net[1], 1, 0, 1);
        const expectedSecond = unitsCreditKop(net[0], 3, 1, 2);
        const credits = await tx.$queryRawUnsafe<Array<{ id: string; credit_kop: number | null }>>(
          `SELECT "id", "credit_kop" FROM "returns" WHERE "order_id" = $1`,
          orderId,
        );
        const byId = new Map(credits.map((c) => [c.id, c.credit_kop]));
        expect(byId.get(first)).toBe(expectedFirst);
        expect(byId.get(second)).toBe(expectedSecond);
        expect(byId.get(rejected)).toBeNull();
        // Every unit came back on a REFUND: the credits are the goods minus the
        // whole discount, to the kopeck.
        expect(expectedFirst + expectedSecond).toBe(99_999 + 18_334 - 10_001);
        expect(await orderOf(tx, orderId)).toMatchObject({
          return_credit_kop: expectedFirst + expectedSecond,
          balance_kop: 108_333 - (expectedFirst + expectedSecond) - 108_333,
        });
      });
    });
  });

  describe('replay and VERIFY', () => {
    async function seedMixed(tx: Tx): Promise<string[]> {
      const a = await insertOrder(tx, { total: '1000.00', paymentStatus: 'REFUNDED' });
      await insertReturn(tx, { orderId: a, refundedAmount: '200.00' });
      const b = await insertOrder(tx, {
        total: '700.00',
        paymentStatus: 'PARTIALLY_REFUNDED',
        paymentMethod: 'ONLINE',
      });
      await insertPayment(tx, {
        orderId: b,
        amount: '700.00',
        status: 'SUCCEEDED',
        refundedAmount: '100.00',
      });
      await insertReturn(tx, { orderId: b, refundedAmount: '50.00' });
      const c = await insertOrder(tx, { total: '300.00', paymentStatus: 'PARTIALLY_REFUNDED' });
      const d = await insertOrder(tx, {
        total: '300.00',
        status: 'REFUNDED',
        paymentStatus: 'PENDING',
      });
      return [a, b, c, d];
    }

    it('a second run changes nothing', async () => {
      await inRolledBackTx(async (tx) => {
        const ids = await seedMixed(tx);

        await runBackfill(tx);
        const snapshot = async () =>
          Promise.all(
            ids.map(async (id) => ({
              order: await orderOf(tx, id),
              entries: await entriesOf(tx, id),
              notes: await notesOf(tx, id),
            })),
          );
        const first = await snapshot();
        await runBackfill(tx);

        expect(await snapshot()).toEqual(first);
      });
    });

    it('VERIFY passes after the backfill', async () => {
      await inRolledBackTx(async (tx) => {
        await seedMixed(tx);
        await runBackfill(tx);

        await expect(runVerify(tx)).resolves.toBeUndefined();
      });
    });

    it('VERIFY raises when an order total disagrees with its ledger', async () => {
      await inRolledBackTx(async (tx) => {
        const [a] = await seedMixed(tx);
        await runBackfill(tx);
        await tx.$executeRawUnsafe(
          `UPDATE "orders" SET "paid_kop" = "paid_kop" + 1 WHERE "id" = $1`,
          a,
        );

        await expect(runVerify(tx)).rejects.toThrow(/totals differ from their ledger/);
      });
    });

    it('VERIFY raises when the legacy OUT is not max(F, R, P)', async () => {
      await inRolledBackTx(async (tx) => {
        const [, b] = await seedMixed(tx);
        await runBackfill(tx);
        // A second copy of the same refund — the sum TASK-951 forbids — with the
        // totals kept consistent so only the source comparison can catch it.
        await tx.$executeRawUnsafe(
          `INSERT INTO "order_money_entries" ("id", "order_id", "direction", "kind", "amount_kop",
             "legacy", "occurred_at")
           VALUES (gen_random_uuid()::text, $1, 'OUT', 'TRANSFER_REFUND', 5000, true, now())`,
          b,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "orders" SET "refunded_kop" = "refunded_kop" + 5000,
                              "balance_kop" = "balance_kop" + 5000 WHERE "id" = $1`,
          b,
        );

        await expect(runVerify(tx)).rejects.toThrow(/legacy IN\/OUT differ from the old sources/);
      });
    });
  });
});
