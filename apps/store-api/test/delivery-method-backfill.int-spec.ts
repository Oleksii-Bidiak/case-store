import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../src/prisma';

/**
 * The delivery-method backfill, against a REAL Postgres (TASK-642).
 *
 * ── What it must do ─────────────────────────────────────────────────────────
 * `20260926100000_delivery_methods` adds `orders.delivery_method` NOT NULL
 * DEFAULT 'NOVA_POSHTA', so every existing order starts as Nova Poshta. Its
 * hand-written UPDATE then marks OTHER every order whose address never carried
 * an NP city ref — the free-text orders whose shipping NP never priced. After it
 * runs, `npCityRef present ⇔ delivery_method <> 'OTHER'` holds for every row.
 *
 * ── Why only the UPDATE is read off disk ────────────────────────────────────
 * `store_test` is schema-synced (`prisma db push`), so the type, columns and
 * table already exist and the DDL half of the migration cannot run twice. The
 * backfill statement, however, is read from the shipped `.sql` and executed as
 * written, so a `WHERE` that matches nothing — the silent no-op plans 180/181
 * shipped — fails HERE. Each scenario first puts every row into the state the
 * column default leaves (all NOVA_POSHTA), runs the backfill, and rolls back.
 */

const MIGRATION_SQL = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260926100000_delivery_methods',
  'migration.sql',
);

/** The one hand-written statement: the `UPDATE "orders"` backfill. */
function backfillStatement(): string {
  const statements = readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.startsWith('UPDATE "orders"'));
  if (statements.length !== 1) {
    throw new Error(
      `Expected exactly one UPDATE "orders" in the migration, found ${statements.length}`,
    );
  }
  return statements[0];
}

type Tx = Prisma.TransactionClient;

const ROLLBACK = new Error('rollback');

/** Every shape `shipping_address` can take on a real row, and what it must become. */
const FIXTURES: ReadonlyArray<{
  label: string;
  /** SQL expression for the column; `NULL` is SQL NULL, everything else is jsonb. */
  address: string;
  expected: 'NOVA_POSHTA' | 'OTHER';
}> = [
  {
    label: 'NP city picked from the directory',
    address: `'{"city":"Київ","npCityRef":"8d5a980d-391c-11dd-90d9-001a92567626"}'::jsonb`,
    expected: 'NOVA_POSHTA',
  },
  {
    label: 'free-text city, key absent',
    address: `'{"city":"Бобровиця"}'::jsonb`,
    expected: 'OTHER',
  },
  {
    label: 'empty-string ref',
    address: `'{"city":"Ніжин","npCityRef":""}'::jsonb`,
    expected: 'OTHER',
  },
  {
    label: 'JSON null ref',
    address: `'{"city":"Ніжин","npCityRef":null}'::jsonb`,
    expected: 'OTHER',
  },
  { label: 'SQL NULL address', address: 'NULL', expected: 'OTHER' },
  { label: 'JSON null address', address: `'null'::jsonb`, expected: 'OTHER' },
  // The risk plan 184 names: a key in another case is NOT an NP ref. No code path
  // ever wrote one, so OTHER is the correct reading, not a silent loss.
  {
    label: 'ref under a differently-cased key',
    address: `'{"city":"Київ","npcityref":"8d5a980d-391c-11dd-90d9-001a92567626"}'::jsonb`,
    expected: 'OTHER',
  },
];

describe('Delivery method on existing orders: backfill migration (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

  async function insertOrder(tx: Tx, address: string): Promise<string> {
    const [row] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "orders" ("id", "subtotal", "total", "shipping_address", "updated_at")
       VALUES (gen_random_uuid()::text, 100, 100, ${address}, now())
       RETURNING "id"`,
    );
    return row.id;
  }

  async function methodOf(tx: Tx, id: string): Promise<string> {
    const [row] = await tx.$queryRawUnsafe<Array<{ method: string }>>(
      `SELECT "delivery_method"::text AS "method" FROM "orders" WHERE "id" = $1`,
      id,
    );
    return row.method;
  }

  /** The two invariant queries from the migration header / SYS-42, over the whole table. */
  async function invariantViolations(
    tx: Tx,
  ): Promise<{ refButOther: number; noRefNotOther: number }> {
    const [row] = await tx.$queryRawUnsafe<
      Array<{ ref_but_other: number; no_ref_not_other: number }>
    >(
      `SELECT
         count(*) FILTER (WHERE COALESCE("shipping_address"->>'npCityRef', '') <> ''
                            AND "delivery_method" = 'OTHER')::int AS "ref_but_other",
         count(*) FILTER (WHERE COALESCE("shipping_address"->>'npCityRef', '') = ''
                            AND "delivery_method" <> 'OTHER')::int AS "no_ref_not_other"
       FROM "orders"`,
    );
    return { refButOther: row.ref_but_other, noRefNotOther: row.no_ref_not_other };
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('marks OTHER exactly the orders without an NP city ref', async () => {
    await inRolledBackTx(async (tx) => {
      const ids = new Map<string, string>();
      for (const fixture of FIXTURES) {
        ids.set(fixture.label, await insertOrder(tx, fixture.address));
      }
      // The state the column default leaves before the UPDATE runs.
      await tx.$executeRawUnsafe(`UPDATE "orders" SET "delivery_method" = 'NOVA_POSHTA'`);
      for (const fixture of FIXTURES) {
        expect(await methodOf(tx, ids.get(fixture.label)!)).toBe('NOVA_POSHTA');
      }

      const changed = await tx.$executeRawUnsafe(backfillStatement());

      // The UPDATE did something — at least every OTHER fixture (plans 180/181).
      expect(changed).toBeGreaterThanOrEqual(FIXTURES.filter((f) => f.expected === 'OTHER').length);
      for (const fixture of FIXTURES) {
        expect({
          label: fixture.label,
          method: await methodOf(tx, ids.get(fixture.label)!),
        }).toEqual({
          label: fixture.label,
          method: fixture.expected,
        });
      }
    });
  });

  it('leaves no row breaking "npCityRef present ⇔ not OTHER" in either direction', async () => {
    await inRolledBackTx(async (tx) => {
      for (const fixture of FIXTURES) {
        await insertOrder(tx, fixture.address);
      }
      await tx.$executeRawUnsafe(`UPDATE "orders" SET "delivery_method" = 'NOVA_POSHTA'`);
      expect((await invariantViolations(tx)).noRefNotOther).toBeGreaterThan(0);

      await tx.$executeRawUnsafe(backfillStatement());

      expect(await invariantViolations(tx)).toEqual({ refButOther: 0, noRefNotOther: 0 });
    });
  });

  it('is idempotent: a second run changes nothing', async () => {
    await inRolledBackTx(async (tx) => {
      for (const fixture of FIXTURES) {
        await insertOrder(tx, fixture.address);
      }
      await tx.$executeRawUnsafe(`UPDATE "orders" SET "delivery_method" = 'NOVA_POSHTA'`);
      await tx.$executeRawUnsafe(backfillStatement());
      const before = await tx.$queryRawUnsafe<Array<{ id: string; method: string }>>(
        `SELECT "id", "delivery_method"::text AS "method" FROM "orders" ORDER BY "id"`,
      );

      await tx.$executeRawUnsafe(backfillStatement());

      const after = await tx.$queryRawUnsafe<Array<{ id: string; method: string }>>(
        `SELECT "id", "delivery_method"::text AS "method" FROM "orders" ORDER BY "id"`,
      );
      expect(after).toEqual(before);
    });
  });
});
