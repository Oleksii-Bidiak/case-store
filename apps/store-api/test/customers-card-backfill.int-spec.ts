import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';

/**
 * The `customers:card` backfill (TASK-479, plan 181) against a REAL Postgres.
 *
 * `permission.catalog.spec.ts` pins what the migration SAYS — that it grants the
 * key the catalogue declares, reads the source key the catalogue declares, and
 * writes per person rather than per role. This file runs the statement and looks
 * at the rows, because the two questions that matter cannot be answered by
 * reading SQL:
 *
 *   - does every current `customers:read` holder come out holding the card, and
 *     NOBODY ELSE? A backfill that is too wide hands the richest personal-data
 *     screen in the system to an operator the owner never ticked it for, and it
 *     does so silently — there is no screen that announces a grant.
 *   - can it run twice? A restore-then-migrate replays every migration, and a
 *     second run that threw on the unique index would abort the deploy.
 *
 * Unlike the TASK-474 backfill next door — whose replay cases died with the
 * `role_permissions` table they read — this statement reads and writes
 * `user_permissions`, which is the live shape. So the replay stays honest: it is
 * the shipped file, executed, not a fixture that resembles it.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('customers:card backfill (TASK-479) — integration', () => {
  let prisma: PrismaService;

  /** Unique per run, so repeated runs never collide on `users.email`. */
  const suffix = randomUUID().slice(0, 8);
  const email = (tag: string) => `t479-${tag}-${suffix}@example.com`;

  const READER = email('reader');
  const WRITER_ONLY = email('writer-only');
  const NOTHING = email('nothing');
  const FIXTURE_EMAILS = [READER, WRITER_ONLY, NOTHING];

  /** The shipped migration, read off disk — not a copy of it. */
  const statement = (() => {
    const root = resolve(__dirname, '../prisma/migrations');
    const dir = readdirSync(root).find((entry) =>
      entry.endsWith('_backfill_customers_card_permission'),
    );
    if (!dir) {
      throw new Error(`No *_backfill_customers_card_permission migration under ${root}`);
    }
    return readFileSync(join(root, dir, 'migration.sql'), 'utf8');
  })();

  async function idsByEmail(): Promise<Record<string, string>> {
    const users = await prisma.user.findMany({
      where: { email: { in: FIXTURE_EMAILS } },
      select: { id: true, email: true },
    });
    return Object.fromEntries(users.map((user) => [user.email, user.id]));
  }

  async function permissionsOf(userId: string): Promise<string[]> {
    const rows = await prisma.userPermission.findMany({
      where: { userId },
      select: { permission: true },
    });
    return rows.map((row) => row.permission).sort();
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

    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });

    // Three managers, chosen so both directions of getting the backfill wrong
    // are visible: one who holds the source key, one who holds a NEIGHBOURING
    // customers key (the near miss a sloppy `LIKE 'customers:%'` would sweep up),
    // and one who holds nothing at all.
    await prisma.user.create({
      data: {
        email: READER,
        passwordHash: 'x',
        role: UserRole.MANAGER,
        permissions: { create: [{ permission: 'customers:read' }, { permission: 'orders:read' }] },
      },
    });
    await prisma.user.create({
      data: {
        email: WRITER_ONLY,
        passwordHash: 'x',
        role: UserRole.MANAGER,
        permissions: { create: [{ permission: 'customers:write' }] },
      },
    });
    await prisma.user.create({
      data: { email: NOTHING, passwordHash: 'x', role: UserRole.MANAGER },
    });

    await prisma.$executeRawUnsafe(statement);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });
    await prisma.$disconnect();
  });

  it('gives the card to the person who could already open it', async () => {
    const ids = await idsByEmail();

    // …and leaves everything else they hold untouched. A backfill that REPLACED
    // a permission set instead of adding to it would pass a "has the card" check
    // and still take the order queue away from them.
    expect(await permissionsOf(ids[READER])).toEqual([
      'customers:card',
      'customers:read',
      'orders:read',
    ]);
  });

  it('gives it to nobody else — not even the neighbouring customers key', async () => {
    const ids = await idsByEmail();

    // `customers:write` is the trap: it is in the same zone, its label mentions
    // customers, and a source list written as a prefix match rather than an exact
    // one would hand the purchase history to somebody the owner only trusted to
    // block an abusive shopper.
    expect(await permissionsOf(ids[WRITER_ONLY])).toEqual(['customers:write']);
    expect(await permissionsOf(ids[NOTHING])).toEqual([]);
  });

  it('runs twice with no second effect', async () => {
    const ids = await idsByEmail();

    await prisma.$executeRawUnsafe(statement);
    await prisma.$executeRawUnsafe(statement);

    // Not just "still exactly one row" — the unique index guarantees that much.
    // The property being proved is that the statement does not THROW on a replay,
    // which is what a restore-then-migrate does to every migration in the folder.
    expect(await permissionsOf(ids[READER])).toEqual([
      'customers:card',
      'customers:read',
      'orders:read',
    ]);
    expect(await permissionsOf(ids[WRITER_ONLY])).toEqual(['customers:write']);
  });

  it('grants nothing to a person hired after it ran', async () => {
    // The backfill is a one-time preservation of yesterday's reach, not a rule.
    // A manager created afterwards gets `customers:card` only when somebody ticks
    // it — which is the default-deny the catalogue opens with, and the reason the
    // exception above had to be argued for rather than assumed.
    const LATE = email('late');
    try {
      const late = await prisma.user.create({
        data: {
          email: LATE,
          passwordHash: 'x',
          role: UserRole.MANAGER,
          permissions: { create: [{ permission: 'customers:read' }] },
        },
      });

      expect(await permissionsOf(late.id)).toEqual(['customers:read']);
    } finally {
      await prisma.user.deleteMany({ where: { email: LATE } });
    }
  });
});
