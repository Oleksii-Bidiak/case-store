import type { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { MailOutboxRepository } from '../src/mail-outbox/mail-outbox.repository';
import { MailOutboxService } from '../src/mail-outbox/mail-outbox.service';
import type { Clock } from '../src/mail-outbox/mail-outbox.clock';
import {
  ACCOUNT_LOCKED_MAIL_TYPE,
  PASSWORD_RESET_MAIL_TYPE,
} from '../src/mail-outbox/mail-outbox.types';
import type { MailService } from '../src/mail/mail.service';
import type { PrismaService } from '../src/prisma';

/**
 * `mail_outbox` → `notification_outbox`, against a REAL Postgres (TASK-672).
 *
 * ── What it must prove ──────────────────────────────────────────────────────
 * The migration is hand-written as renames because `migrate diff` would emit
 * DROP + CREATE and silently throw away every PENDING row — letters the shop
 * already promised (order confirmations, password resets) that the worker has
 * not delivered yet. "No rows lost" is not enough on its own: the rows must
 * still be DELIVERABLE afterwards. So this spec goes all the way to the worker:
 * after the migration the real repository + service dispatch the due PENDING
 * rows to the very addresses they were enqueued for.
 *
 * ── Why a scratch schema ────────────────────────────────────────────────────
 * `store_test` is already at the head of the migration history, so the table is
 * called `notification_outbox` there and the old migration cannot run twice. Each
 * run therefore builds the pre-TASK-672 world in its own throwaway schema: it
 * executes the ORIGINAL `add_mail_outbox` migration verbatim, fills the table
 * with rows in every status, then executes the NEW migration verbatim — the
 * exact files `migrate deploy` ships, not a paraphrase of them. The search_path
 * holds only the scratch schema, so an unqualified name in either file can never
 * reach `public`. The schema is dropped in `afterAll`.
 */

const MIGRATIONS = join(__dirname, '..', 'prisma', 'migrations');
const OLD_MIGRATION = join(MIGRATIONS, '20260630140747_add_mail_outbox', 'migration.sql');
const NEW_MIGRATION = join(MIGRATIONS, '20261001100000_notification_outbox', 'migration.sql');

/** The worker's "now". Fixture schedules are expressed relative to it. */
const NOW = new Date('2026-10-01T12:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

/** `timestamp(3)` literal in UTC, the way Prisma stores and reads the column. */
const ts = (date: Date) => date.toISOString().replace('T', ' ').replace('Z', '');

type FixtureRow = {
  id: string;
  type: string;
  recipient: string;
  payload: Record<string, string>;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
  sentAt: Date | null;
};

/**
 * One row per state the live table can hold. The two due PENDING rows carry
 * different types (so routing by `type` is proven to survive) and one of them is
 * mid-retry (attempts + last_error must not be reset by the migration).
 */
const FIXTURES: readonly FixtureRow[] = [
  {
    id: 'mig672-due-fresh',
    type: PASSWORD_RESET_MAIL_TYPE,
    recipient: 'due-fresh@example.com',
    payload: {
      to: 'due-fresh@example.com',
      resetUrl: 'http://localhost:3000/reset-password?token=mig672',
      expiresInHuman: '1 годину',
    },
    status: 'PENDING',
    attempts: 0,
    lastError: null,
    nextAttemptAt: minutes(-60),
    sentAt: null,
  },
  {
    id: 'mig672-due-retrying',
    type: ACCOUNT_LOCKED_MAIL_TYPE,
    recipient: 'due-retrying@example.com',
    payload: { to: 'due-retrying@example.com', supportUrl: 'http://localhost:3000/contact' },
    status: 'PENDING',
    attempts: 2,
    lastError: 'Connection timeout',
    nextAttemptAt: minutes(-5),
    sentAt: null,
  },
  {
    id: 'mig672-backing-off',
    type: PASSWORD_RESET_MAIL_TYPE,
    recipient: 'backing-off@example.com',
    payload: {
      to: 'backing-off@example.com',
      resetUrl: 'http://localhost:3000/reset-password?token=later',
      expiresInHuman: '1 годину',
    },
    status: 'PENDING',
    attempts: 1,
    lastError: 'Greylisted',
    nextAttemptAt: minutes(30),
    sentAt: null,
  },
  {
    id: 'mig672-sent',
    type: PASSWORD_RESET_MAIL_TYPE,
    recipient: 'sent@example.com',
    payload: {
      to: 'sent@example.com',
      resetUrl: 'http://localhost:3000/reset-password?token=done',
      expiresInHuman: '1 годину',
    },
    status: 'SENT',
    attempts: 0,
    lastError: null,
    nextAttemptAt: minutes(-120),
    sentAt: minutes(-119),
  },
  {
    id: 'mig672-failed',
    type: ACCOUNT_LOCKED_MAIL_TYPE,
    recipient: 'failed@example.com',
    payload: { to: 'failed@example.com', supportUrl: 'http://localhost:3000/contact' },
    status: 'FAILED',
    attempts: 5,
    lastError: 'Mailbox does not exist',
    nextAttemptAt: minutes(-240),
    sentAt: null,
  },
];

const DUE_IDS = ['mig672-due-fresh', 'mig672-due-retrying'];

/** Row snapshot as text, so timestamps never pass through JS timezone parsing. */
type Snapshot = {
  id: string;
  type: string;
  address: string;
  payload: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  sent_at: string | null;
};

const SNAPSHOT_COLUMNS = `"id", "type", "payload"::text AS "payload", "status"::text AS "status",
  "attempts", "max_attempts", "last_error", "next_attempt_at"::text AS "next_attempt_at",
  "created_at"::text AS "created_at", "sent_at"::text AS "sent_at"`;

describe('mail_outbox → notification_outbox migration (integration, TASK-672)', () => {
  const schema = `mig672_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  let sql: Client;
  let prisma: PrismaClient | undefined;
  let before: Snapshot[];

  async function snapshot(table: string, addressColumn: string): Promise<Snapshot[]> {
    const { rows } = await sql.query<Snapshot>(
      `SELECT ${SNAPSHOT_COLUMNS}, "${addressColumn}" AS "address" FROM "${table}" ORDER BY "id"`,
    );
    return rows;
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    sql = new Client({ connectionString: url });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    // Only the scratch schema: an unqualified name in either migration file must
    // resolve here or fail — never fall through to the real tables in `public`.
    await sql.query(`SET search_path TO "${schema}"`);

    // The world as it was before TASK-672, built by the shipped file itself.
    await sql.query(readFileSync(OLD_MIGRATION, 'utf8'));

    for (const row of FIXTURES) {
      await sql.query(
        `INSERT INTO "mail_outbox"
           ("id", "type", "recipient", "payload", "status", "attempts", "last_error",
            "next_attempt_at", "created_at", "sent_at")
         VALUES ($1, $2, $3, $4::jsonb, $5::"MailOutboxStatus", $6, $7, $8, $9, $10)`,
        [
          row.id,
          row.type,
          row.recipient,
          JSON.stringify(row.payload),
          row.status,
          row.attempts,
          row.lastError,
          ts(row.nextAttemptAt),
          ts(minutes(-300)),
          row.sentAt ? ts(row.sentAt) : null,
        ],
      );
    }
    before = await snapshot('mail_outbox', 'recipient');

    // The migration under test, executed whole, exactly as `migrate deploy` would.
    await sql.query(readFileSync(NEW_MIGRATION, 'utf8'));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (sql) {
      await sql.query('SET search_path TO public');
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  it('keeps every row, every address, attempt counter and schedule exactly as it was', async () => {
    const after = await snapshot('notification_outbox', 'recipient_address');

    expect(before).toHaveLength(FIXTURES.length);
    expect(after).toEqual(before);
    // And the snapshot really is the fixtures, not two equally-wrong reads.
    expect(after.map((row) => [row.id, row.address, row.status, row.attempts])).toEqual(
      [...FIXTURES]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((row) => [row.id, row.recipient, row.status, row.attempts]),
    );
  });

  it('backfills every existing row to the EMAIL channel', async () => {
    const { rows } = await sql.query<{ channel: string; count: string }>(
      `SELECT "channel"::text AS "channel", count(*)::text AS "count"
         FROM "notification_outbox" GROUP BY 1`,
    );
    expect(rows).toEqual([{ channel: 'EMAIL', count: String(FIXTURES.length) }]);
  });

  it('leaves no trace of the old table or type and creates the names Prisma expects', async () => {
    const { rows: relations } = await sql.query<{ old: string | null; renamed: string | null }>(
      `SELECT to_regclass($1)::text AS "old", to_regclass($2)::text AS "renamed"`,
      [`"${schema}"."mail_outbox"`, `"${schema}"."notification_outbox"`],
    );
    expect(relations[0].old).toBeNull();
    expect(relations[0].renamed).not.toBeNull();

    const { rows: types } = await sql.query<{ typname: string }>(
      `SELECT t."typname" FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1 AND t.typtype = 'e' ORDER BY 1`,
      [schema],
    );
    expect(types.map((type) => type.typname)).toEqual([
      'NotificationChannel',
      'NotificationOutboxStatus',
    ]);

    const { rows: indexes } = await sql.query<{ indexname: string }>(
      `SELECT "indexname" FROM pg_indexes WHERE "schemaname" = $1 ORDER BY 1`,
      [schema],
    );
    expect(indexes.map((index) => index.indexname)).toEqual([
      'notification_outbox_channel_status_idx',
      'notification_outbox_pkey',
      'notification_outbox_status_next_attempt_at_idx',
    ]);
  });

  it('dispatches the due PENDING rows to their original addresses after the migration', async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema }),
    });
    await prisma.$connect();

    const mailService = {
      isEnabled: () => true,
      sendPasswordResetPayload: jest.fn().mockResolvedValue(undefined),
      sendAccountLockedPayload: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: (key: string, fallback?: unknown) => (key === 'NODE_ENV' ? 'test' : fallback),
    };
    const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const clock: Clock = { now: () => NOW };

    const service = new MailOutboxService(
      new MailOutboxRepository(prisma as unknown as PrismaService),
      mailService as unknown as MailService,
      config as unknown as ConfigService,
      logger as unknown as PinoLogger,
      clock,
    );

    const result = await service.dispatchDue();

    expect(result).toEqual({ sent: DUE_IDS.length, retried: 0, failed: 0 });

    const byId = new Map(FIXTURES.map((row) => [row.id, row]));
    expect(mailService.sendPasswordResetPayload).toHaveBeenCalledTimes(1);
    expect(mailService.sendPasswordResetPayload).toHaveBeenCalledWith(
      byId.get('mig672-due-fresh')!.payload,
    );
    expect(mailService.sendAccountLockedPayload).toHaveBeenCalledTimes(1);
    expect(mailService.sendAccountLockedPayload).toHaveBeenCalledWith(
      byId.get('mig672-due-retrying')!.payload,
    );

    const after = await snapshot('notification_outbox', 'recipient_address');
    for (const row of after) {
      const original = before.find((candidate) => candidate.id === row.id)!;
      if (DUE_IDS.includes(row.id)) {
        expect(row).toEqual({
          ...original,
          status: 'SENT',
          sent_at: ts(NOW).replace(/\.000$/, ''),
          last_error: null,
        });
      } else {
        // Not due yet, already SENT, or terminally FAILED: untouched.
        expect(row).toEqual(original);
      }
    }
  });
});
