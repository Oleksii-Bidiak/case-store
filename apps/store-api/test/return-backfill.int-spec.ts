import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../src/prisma';

/**
 * The returns decision/channel backfill (TASK-1961/2044/1963/2045, B-12 §1),
 * against a REAL Postgres.
 *
 * ── What it must do ─────────────────────────────────────────────────────────
 * `20261031120000_returns_decisions_r1` adds `decision`, `decision_legacy` and
 * `channel` to `returns` and a `return_decision_events` history. Before B-12 the
 * only decisions that existed were "refund" and "reject", so:
 *   - APPROVED / RECEIVED / REFUNDED → decision REFUND, decided_at = resolved_at;
 *   - REJECTED → decision REJECT with NO reason (none was ever asked for);
 *   - both get decision_legacy = true and exactly ONE legacy event (actor null,
 *     created_at = coalesce(resolved_at, requested_at));
 *   - REQUESTED is untouched — nobody has decided anything yet;
 *   - channel is OPERATOR when the row was opened by someone other than the
 *     order's owner (a guest order has no owner, so any opener differs),
 *     ACCOUNT otherwise.
 * It must not change a single pre-existing column: status, money and dates are
 * the customer's record.
 *
 * ── Why only the marked section is read off disk ────────────────────────────
 * `store_test` is already migrated, so the DDL half cannot run twice. The
 * hand-written statements between the BACKFILL markers are read from the shipped
 * `.sql` and executed as written; each scenario inserts legacy-shaped rows (new
 * columns at their defaults), runs the backfill, asserts and rolls back. Rows
 * already in `store_test` were backfilled by `migrate deploy`, so a correct —
 * idempotent — backfill leaves them alone and only ours change.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */

const MIGRATION_SQL = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20261031120000_returns_decisions_r1',
  'migration.sql',
);

const BEGIN = '-- BACKFILL:BEGIN';
const END = '-- BACKFILL:END';

/** The hand-written statements between the markers, one command each. */
function backfillStatements(): string[] {
  const sql = readFileSync(MIGRATION_SQL, 'utf8');
  const from = sql.indexOf(BEGIN);
  const to = sql.indexOf(END);
  if (from < 0 || to < 0 || to < from) {
    throw new Error(`Expected "${BEGIN}" … "${END}" markers in ${MIGRATION_SQL}`);
  }
  return sql
    .slice(from + BEGIN.length, to)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

type Tx = Prisma.TransactionClient;

const ROLLBACK = new Error('rollback');

type LegacyStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'REFUNDED';

interface ReturnRow {
  status: string;
  channel: string;
  decision: string | null;
  decision_reason: string | null;
  decided_at: Date | null;
  decided_by_id: string | null;
  decision_legacy: boolean;
  requested_outcome: string | null;
  reason: string | null;
  operator_notes: string | null;
  requested_at: Date;
  resolved_at: Date | null;
  restocked_at: Date | null;
  refunded_amount: string | null;
  created_by_user_id: string | null;
  updated_at: Date;
}

interface EventRow {
  decision: string;
  reason: string | null;
  actor_id: string | null;
  legacy: boolean;
  created_at: Date;
}

describe('Returns decisions/channel backfill (TASK-1961/2044/1963/2045) — integration', () => {
  let prisma: PrismaService;
  const statements = backfillStatements();

  beforeAll(async () => {
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
        { timeout: 60_000, maxWait: 20_000 },
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

  async function insertUser(tx: Tx): Promise<string> {
    const id = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "users" ("id", "email", "updated_at") VALUES ($1, $2, now())`,
      id,
      `r1-backfill-${id.slice(0, 8)}@example.com`,
    );
    return id;
  }

  async function insertOrder(tx: Tx, userId: string | null): Promise<string> {
    const [row] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "orders" ("id", "user_id", "subtotal", "total", "shipping_address", "updated_at")
       VALUES (gen_random_uuid()::text, $1, 100, 100, '{"city":"Київ"}'::jsonb, now())
       RETURNING "id"`,
      userId,
    );
    return row.id;
  }

  /** A row shaped exactly like one written before R1: only pre-existing columns set. */
  async function insertLegacyReturn(
    tx: Tx,
    input: {
      orderId: string;
      status: LegacyStatus;
      createdByUserId?: string | null;
      resolvedAt?: string | null;
      restockedAt?: string | null;
      refundedAmount?: string | null;
      operatorNotes?: string | null;
    },
  ): Promise<string> {
    const id = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "returns" ("id", "order_id", "status", "reason", "operator_notes",
         "requested_at", "resolved_at", "restocked_at", "refunded_amount",
         "created_by_user_id", "updated_at")
       VALUES ($1, $2, $3::"ReturnStatus", 'Не підійшов', $4,
         '2026-09-01T10:00:00Z', $5::timestamp, $6::timestamp, $7::numeric,
         $8, '2026-09-02T10:00:00Z')`,
      id,
      input.orderId,
      input.status,
      input.operatorNotes ?? null,
      input.resolvedAt ?? null,
      input.restockedAt ?? null,
      input.refundedAmount ?? null,
      input.createdByUserId ?? null,
    );
    return id;
  }

  async function returnOf(tx: Tx, id: string): Promise<ReturnRow> {
    const [row] = await tx.$queryRawUnsafe<ReturnRow[]>(
      `SELECT "status"::text, "channel"::text, "decision"::text, "decision_reason",
              "decided_at", "decided_by_id", "decision_legacy", "requested_outcome"::text,
              "reason", "operator_notes", "requested_at", "resolved_at", "restocked_at",
              "refunded_amount"::text, "created_by_user_id", "updated_at"
         FROM "returns" WHERE "id" = $1`,
      id,
    );
    return row;
  }

  async function eventsOf(tx: Tx, id: string): Promise<EventRow[]> {
    return tx.$queryRawUnsafe<EventRow[]>(
      `SELECT "decision"::text, "reason", "actor_id", "legacy", "created_at"
         FROM "return_decision_events" WHERE "return_id" = $1 ORDER BY "created_at"`,
      id,
    );
  }

  it('extracts the hand-written statements from the shipped migration', () => {
    expect(statements.length).toBeGreaterThan(0);
  });

  describe('decision', () => {
    it.each(['APPROVED', 'RECEIVED', 'REFUNDED'] as const)(
      '%s becomes a legacy REFUND decided at resolved_at, with one legacy event',
      async (status) => {
        await inRolledBackTx(async (tx) => {
          const owner = await insertUser(tx);
          const orderId = await insertOrder(tx, owner);
          const id = await insertLegacyReturn(tx, {
            orderId,
            status,
            createdByUserId: owner,
            resolvedAt: '2026-09-03T12:00:00Z',
          });

          await runBackfill(tx);

          const row = await returnOf(tx, id);
          expect(row.decision).toBe('REFUND');
          expect(row.decision_legacy).toBe(true);
          expect(row.decision_reason).toBeNull();
          expect(row.decided_by_id).toBeNull();
          expect(row.decided_at?.toISOString()).toBe('2026-09-03T12:00:00.000Z');
          expect(row.requested_outcome).toBeNull();

          const events = await eventsOf(tx, id);
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            decision: 'REFUND',
            reason: null,
            actor_id: null,
            legacy: true,
          });
          expect(events[0].created_at.toISOString()).toBe('2026-09-03T12:00:00.000Z');
        });
      },
    );

    it('REJECTED becomes a legacy REJECT with no reason, and one legacy event', async () => {
      await inRolledBackTx(async (tx) => {
        const owner = await insertUser(tx);
        const orderId = await insertOrder(tx, owner);
        const id = await insertLegacyReturn(tx, {
          orderId,
          status: 'REJECTED',
          createdByUserId: owner,
          resolvedAt: '2026-09-04T08:30:00Z',
          operatorNotes: 'Сліди використання',
        });

        await runBackfill(tx);

        const row = await returnOf(tx, id);
        expect(row.decision).toBe('REJECT');
        expect(row.decision_reason).toBeNull();
        expect(row.decision_legacy).toBe(true);
        expect(row.decided_at?.toISOString()).toBe('2026-09-04T08:30:00.000Z');

        const events = await eventsOf(tx, id);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          decision: 'REJECT',
          reason: null,
          actor_id: null,
          legacy: true,
        });
      });
    });

    it('an event falls back to requested_at when the row was never stamped resolved', async () => {
      await inRolledBackTx(async (tx) => {
        const owner = await insertUser(tx);
        const orderId = await insertOrder(tx, owner);
        const id = await insertLegacyReturn(tx, {
          orderId,
          status: 'APPROVED',
          createdByUserId: owner,
          resolvedAt: null,
        });

        await runBackfill(tx);

        const row = await returnOf(tx, id);
        expect(row.decided_at).toBeNull();
        const events = await eventsOf(tx, id);
        expect(events).toHaveLength(1);
        expect(events[0].created_at.toISOString()).toBe('2026-09-01T10:00:00.000Z');
      });
    });

    it('REQUESTED is untouched: no decision, not legacy, no event', async () => {
      await inRolledBackTx(async (tx) => {
        const owner = await insertUser(tx);
        const orderId = await insertOrder(tx, owner);
        const id = await insertLegacyReturn(tx, {
          orderId,
          status: 'REQUESTED',
          createdByUserId: owner,
        });

        await runBackfill(tx);

        const row = await returnOf(tx, id);
        expect(row.decision).toBeNull();
        expect(row.decided_at).toBeNull();
        expect(row.decision_legacy).toBe(false);
        expect(await eventsOf(tx, id)).toHaveLength(0);
      });
    });

    it('is idempotent: a second run adds no events and changes nothing', async () => {
      await inRolledBackTx(async (tx) => {
        const owner = await insertUser(tx);
        const orderId = await insertOrder(tx, owner);
        const id = await insertLegacyReturn(tx, {
          orderId,
          status: 'REFUNDED',
          createdByUserId: owner,
          resolvedAt: '2026-09-05T09:00:00Z',
        });

        await runBackfill(tx);
        const first = await returnOf(tx, id);
        await runBackfill(tx);

        expect(await returnOf(tx, id)).toEqual(first);
        expect(await eventsOf(tx, id)).toHaveLength(1);
      });
    });
  });

  describe('channel', () => {
    it('ACCOUNT when the order owner opened it', async () => {
      await inRolledBackTx(async (tx) => {
        const owner = await insertUser(tx);
        const orderId = await insertOrder(tx, owner);
        const id = await insertLegacyReturn(tx, {
          orderId,
          status: 'REQUESTED',
          createdByUserId: owner,
        });

        await runBackfill(tx);

        expect((await returnOf(tx, id)).channel).toBe('ACCOUNT');
      });
    });

    it('OPERATOR when someone other than the owner opened it', async () => {
      await inRolledBackTx(async (tx) => {
        const owner = await insertUser(tx);
        const operator = await insertUser(tx);
        const orderId = await insertOrder(tx, owner);
        const id = await insertLegacyReturn(tx, {
          orderId,
          status: 'REFUNDED',
          createdByUserId: operator,
          resolvedAt: '2026-09-05T09:00:00Z',
        });

        await runBackfill(tx);

        expect((await returnOf(tx, id)).channel).toBe('OPERATOR');
      });
    });

    it('OPERATOR when an account opened a return on a guest order (no owner)', async () => {
      await inRolledBackTx(async (tx) => {
        const operator = await insertUser(tx);
        const orderId = await insertOrder(tx, null);
        const id = await insertLegacyReturn(tx, {
          orderId,
          status: 'REQUESTED',
          createdByUserId: operator,
        });

        await runBackfill(tx);

        expect((await returnOf(tx, id)).channel).toBe('OPERATOR');
      });
    });

    it('ACCOUNT for rows predating created_by_user_id (null opener)', async () => {
      await inRolledBackTx(async (tx) => {
        const owner = await insertUser(tx);
        const orderId = await insertOrder(tx, owner);
        const id = await insertLegacyReturn(tx, {
          orderId,
          status: 'APPROVED',
          createdByUserId: null,
          resolvedAt: '2026-09-03T12:00:00Z',
        });

        await runBackfill(tx);

        expect((await returnOf(tx, id)).channel).toBe('ACCOUNT');
      });
    });
  });

  it('does not modify any pre-existing column', async () => {
    await inRolledBackTx(async (tx) => {
      const owner = await insertUser(tx);
      const operator = await insertUser(tx);
      const orderId = await insertOrder(tx, owner);
      const id = await insertLegacyReturn(tx, {
        orderId,
        status: 'RECEIVED',
        createdByUserId: operator,
        resolvedAt: '2026-09-03T12:00:00Z',
        restockedAt: '2026-09-04T12:00:00Z',
        refundedAmount: '399.50',
        operatorNotes: 'Коробка пошкоджена',
      });
      const pick = (row: ReturnRow) => ({
        status: row.status,
        reason: row.reason,
        operator_notes: row.operator_notes,
        requested_at: row.requested_at,
        resolved_at: row.resolved_at,
        restocked_at: row.restocked_at,
        refunded_amount: row.refunded_amount,
        created_by_user_id: row.created_by_user_id,
        updated_at: row.updated_at,
      });
      const before = pick(await returnOf(tx, id));

      await runBackfill(tx);

      expect(pick(await returnOf(tx, id))).toEqual(before);
    });
  });
});
