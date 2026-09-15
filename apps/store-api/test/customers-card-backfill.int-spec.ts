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
 * This migration reads and writes `user_permissions`, the live shape, so the
 * replay needs no scaffolding at all: it is the shipped file, executed. The
 * TASK-474 backfill next door needs its source table recreated as a TEMP table
 * first, because TASK-475 dropped `role_permissions` — see that file for why the
 * replay is still worth having on those terms.
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

  const TEMPLATE_WITH_READ = `t479-tpl-read-${suffix}`;
  const TEMPLATE_WITHOUT = `t479-tpl-plain-${suffix}`;
  const FIXTURE_TEMPLATES = [TEMPLATE_WITH_READ, TEMPLATE_WITHOUT];

  /**
   * The shipped migration, read off disk — not a copy of it — split into its
   * individual statements.
   *
   * Split rather than fed in whole because the migration carries TWO statements
   * since the template carve-out was added, and `$executeRawUnsafe` goes through
   * the extended protocol, which refuses more than one command per call. Comments
   * are stripped for the same reason a trailing empty fragment is dropped: what
   * is executed has to be exactly what Postgres would run, one command at a time.
   */
  const statements = (() => {
    const root = resolve(__dirname, '../prisma/migrations');
    const dir = readdirSync(root).find((entry) =>
      entry.endsWith('_backfill_customers_card_permission'),
    );
    if (!dir) {
      throw new Error(`No *_backfill_customers_card_permission migration under ${root}`);
    }
    return readFileSync(join(root, dir, 'migration.sql'), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0);
  })();

  /** Replay the whole migration, in order. */
  async function runMigration(): Promise<void> {
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  }

  async function idsByEmail(): Promise<Record<string, string>> {
    const users = await prisma.user.findMany({
      where: { email: { in: FIXTURE_EMAILS } },
      select: { id: true, email: true },
    });
    return Object.fromEntries(users.map((user) => [user.email, user.id]));
  }

  async function templateItems(name: string): Promise<string[]> {
    const template = await prisma.permissionTemplate.findUniqueOrThrow({
      where: { name },
      select: { items: { select: { permission: true } } },
    });
    return template.items.map((item) => item.permission).sort();
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

    // Two templates, standing in for what a shop already has when this migration
    // arrives: one that offered the customer card back when `customers:read` WAS
    // the card, and one that never did.
    await prisma.permissionTemplate.create({
      data: {
        name: TEMPLATE_WITH_READ,
        items: { create: [{ permission: 'customers:read' }, { permission: 'orders:read' }] },
      },
    });
    await prisma.permissionTemplate.create({
      data: { name: TEMPLATE_WITHOUT, items: { create: [{ permission: 'orders:read' }] } },
    });

    await runMigration();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });
    await prisma.permissionTemplate.deleteMany({ where: { name: { in: FIXTURE_TEMPLATES } } });
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

  it('follows `customers:read` into the TEMPLATES that offered it', async () => {
    // The people half of this migration is not enough on its own. A template is
    // what the next hire is set up from, so a key carved out of `customers:read`
    // has to follow it there too — otherwise the split reaches everybody who
    // already works here and misses everybody hired afterwards, and the two
    // groups end up with different access from the same tick.
    //
    // «Менеджер (як було)» is the case that makes this concrete: the TASK-474
    // migration created it one migration before this key existed, and the admin
    // guide promises it holds exactly what the MANAGER role used to.
    expect(await templateItems(TEMPLATE_WITH_READ)).toEqual([
      'customers:card',
      'customers:read',
      'orders:read',
    ]);
  });

  it('leaves a template that never offered the card alone', async () => {
    expect(await templateItems(TEMPLATE_WITHOUT)).toEqual(['orders:read']);
  });

  it('runs twice with no second effect', async () => {
    const ids = await idsByEmail();

    await runMigration();
    await runMigration();

    // Not just "still exactly one row" — the unique index guarantees that much.
    // The property being proved is that the statement does not THROW on a replay,
    // which is what a restore-then-migrate does to every migration in the folder.
    expect(await permissionsOf(ids[READER])).toEqual([
      'customers:card',
      'customers:read',
      'orders:read',
    ]);
    expect(await permissionsOf(ids[WRITER_ONLY])).toEqual(['customers:write']);
    // The template half is idempotent too: `permission_template_items` has its
    // own unique index and its own ON CONFLICT, and only the first statement was
    // ever replayed before the second one existed.
    expect(await templateItems(TEMPLATE_WITH_READ)).toEqual([
      'customers:card',
      'customers:read',
      'orders:read',
    ]);
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
