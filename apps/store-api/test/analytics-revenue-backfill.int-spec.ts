import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';

/**
 * The `analytics:revenue` backfill (TASK-684, plan 188) against a REAL Postgres.
 *
 * `permission.catalog.spec.ts` pins what the migration SAYS — which keys it
 * names, that it writes to people and templates and never to a role. This file
 * runs the shipped statements and looks at the rows, because the questions that
 * matter cannot be answered by reading SQL:
 *
 *   - does every current `analytics:read` holder come out holding the money, and
 *     NOBODY ELSE? Too narrow, and a manager's dashboard loses its revenue tiles
 *     overnight with no message; too wide, and somebody the owner trusted with a
 *     neighbouring key reads the till.
 *   - does it reach PEOPLE at all? Wave 180 shipped a conditional backfill
 *     against a role matrix that held one row for the whole shop, and it granted
 *     nothing on every database measured. The only proof against that is a real
 *     person row going in and a real grant coming out.
 *   - can it run twice? A restore-then-migrate replays every file.
 *
 * Everything happens inside one transaction that is always rolled back, so the
 * replay leaves no fixture behind on a shared test database.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('analytics:revenue backfill (TASK-684) — integration', () => {
  let prisma: PrismaService;

  class Rollback extends Error {}

  const suffix = randomUUID().slice(0, 8);
  const email = (tag: string) => `t684-${tag}-${suffix}@example.com`;

  /**
   * The shipped migration, read off disk and split into statements —
   * `$executeRawUnsafe` refuses more than one command per call, and comments are
   * stripped so what runs is exactly what Postgres would run.
   */
  const statements = (() => {
    const root = resolve(__dirname, '../prisma/migrations');
    const dir = readdirSync(root).find((entry) =>
      entry.endsWith('_backfill_analytics_revenue_permission'),
    );
    if (!dir) {
      throw new Error(`No *_backfill_analytics_revenue_permission migration under ${root}`);
    }
    return readFileSync(join(root, dir, 'migration.sql'), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0);
  })();

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
    await prisma.$disconnect();
  });

  it('follows analytics:read with the money, per person and per template, and reaches nobody else', async () => {
    let result:
      | {
          reader: string[];
          readerAgain: string[];
          neighbour: string[];
          nothing: string[];
          templateWithRead: string[];
          templateWithout: string[];
        }
      | undefined;

    try {
      await prisma.$transaction(async (tx) => {
        // Three managers, so both directions of getting it wrong are visible:
        // the dashboard reader, a colleague who reads orders but was never given
        // the dashboard (a backfill keyed on "is staff" rather than on the source
        // key would hand them the till), and somebody holding nothing at all.
        const reader = await tx.user.create({
          data: {
            email: email('reader'),
            passwordHash: 'x',
            role: UserRole.MANAGER,
            permissions: {
              create: [{ permission: 'analytics:read' }, { permission: 'orders:read' }],
            },
          },
        });
        const neighbour = await tx.user.create({
          data: {
            email: email('neighbour'),
            passwordHash: 'x',
            role: UserRole.MANAGER,
            permissions: { create: [{ permission: 'orders:read' }] },
          },
        });
        const nothing = await tx.user.create({
          data: { email: email('nothing'), passwordHash: 'x', role: UserRole.MANAGER },
        });

        const templateWithRead = await tx.permissionTemplate.create({
          data: {
            name: `t684-read-${suffix}`,
            items: { create: [{ permission: 'analytics:read' }, { permission: 'orders:read' }] },
          },
        });
        const templateWithout = await tx.permissionTemplate.create({
          data: {
            name: `t684-plain-${suffix}`,
            items: { create: [{ permission: 'orders:read' }] },
          },
        });

        const held = async (userId: string) =>
          (
            await tx.userPermission.findMany({ where: { userId }, orderBy: { permission: 'asc' } })
          ).map((row) => row.permission);
        const offered = async (templateId: string) =>
          (
            await tx.permissionTemplateItem.findMany({
              where: { templateId },
              orderBy: { permission: 'asc' },
            })
          ).map((item) => item.permission);

        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }
        const readerRows = await held(reader.id);

        // Idempotent: the replay a restore-then-migrate performs must not throw
        // on the unique index, and must add nothing.
        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }

        result = {
          reader: readerRows,
          readerAgain: await held(reader.id),
          neighbour: await held(neighbour.id),
          nothing: await held(nothing.id),
          templateWithRead: await offered(templateWithRead.id),
          templateWithout: await offered(templateWithout.id),
        };
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    // Added to, never replaced: a backfill that REPLACED the set would pass a
    // "has the money" check and still take the order queue away.
    expect(result?.reader).toEqual(['analytics:read', 'analytics:revenue', 'orders:read']);
    expect(result?.readerAgain).toEqual(result?.reader);
    expect(result?.neighbour).toEqual(['orders:read']);
    expect(result?.nothing).toEqual([]);
    // A template is what the next hire is set up from: one that offered the
    // dashboard offered its revenue, and must keep doing so after the split.
    expect(result?.templateWithRead).toEqual([
      'analytics:read',
      'analytics:revenue',
      'orders:read',
    ]);
    expect(result?.templateWithout).toEqual(['orders:read']);
  });
});
