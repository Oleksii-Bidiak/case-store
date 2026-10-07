import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';
import {
  HOME_BACKFILL_SOURCE_PERMISSIONS,
  READ_BACKFILL_PAIRS,
} from '../src/auth/permissions/permission.catalog';

/**
 * The `home:write` + `:read` backfill (TASK-665 / TASK-666, plan 186) against a REAL
 * Postgres.
 *
 * `permission.catalog.spec.ts` pins what the migration SAYS. This file runs the
 * shipped statements on real rows, because the questions that matter cannot be
 * answered by reading SQL:
 *
 *   - did anybody LOSE anything? A backfill that replaced a set instead of adding
 *     to it would pass a "has the new key" check and still take a section away;
 *   - does everybody holding `x:write` come out holding `x:read`, and does
 *     `home:write` reach exactly the holders of `carousels:write` / `banners:write`
 *     — and `home:read` reach them too, in the same run (order of the statements)?
 *   - did it insert ANYTHING? Wave 180 shipped a conditional backfill that granted
 *     nothing on every database measured; the only proof against that is counting.
 *   - can it run twice? A restore-then-migrate replays every file.
 *
 * Everything happens inside one transaction that is always rolled back.
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('home:write + :read backfill (TASK-665 / TASK-666) — integration', () => {
  let prisma: PrismaService;

  class Rollback extends Error {}

  const suffix = randomUUID().slice(0, 8);
  const email = (tag: string) => `t665-${tag}-${suffix}@example.com`;

  const statements = (() => {
    const root = resolve(__dirname, '../prisma/migrations');
    const dir = readdirSync(root).find((entry) =>
      entry.endsWith('_backfill_home_and_read_permissions'),
    );
    if (!dir) {
      throw new Error(`No *_backfill_home_and_read_permissions migration under ${root}`);
    }
    return readFileSync(join(root, dir, 'migration.sql'), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0);
  })();

  /** The expected set after the backfill, computed from the declared code contract. */
  const expectedAfter = (before: readonly string[]): string[] => {
    const held = new Set(before);
    if (HOME_BACKFILL_SOURCE_PERMISSIONS.some((key) => held.has(key))) {
      held.add('home:write');
    }
    for (const [write, read] of READ_BACKFILL_PAIRS) {
      if (held.has(write)) held.add(read);
    }
    return [...held].sort();
  };

  /** The people (and templates) of the fixture, each with what they hold BEFORE. */
  const PEOPLE: Record<string, string[]> = {
    carousels: ['carousels:write'],
    banners: ['banners:write', 'pages:write', 'orders:read'],
    everything: READ_BACKFILL_PAIRS.map(([write]) => write as string),
    // Already holds home:write AND one :read — ON CONFLICT must leave them alone.
    alreadyHome: ['home:write', 'categories:write', 'categories:read'],
    catalogue: ['brands:write', 'devices:write', 'attributes:write', 'addons:write'],
    marketing: ['discounts:write', 'faq:write', 'blog:write'],
    // A neighbour whose keys are none of the sources: must come out unchanged.
    orders: ['orders:read', 'orders:write'],
    nothing: [],
  };
  const TEMPLATES: Record<string, string[]> = {
    content: ['banners:write', 'faq:write'],
    plain: ['orders:read'],
  };

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

  it('adds each :read to its :write holders and home:write(+read) to carousels/banners holders, takes nothing away, inserts rows and replays as a no-op', async () => {
    let result:
      | {
          people: Record<string, { before: string[]; after: string[]; again: string[] }>;
          templates: Record<string, { before: string[]; after: string[] }>;
          inserted: number;
          insertedAgain: number;
        }
      | undefined;

    try {
      await prisma.$transaction(async (tx) => {
        const userIds: Record<string, string> = {};
        for (const [tag, keys] of Object.entries(PEOPLE)) {
          const user = await tx.user.create({
            data: {
              email: email(tag),
              passwordHash: 'x',
              role: UserRole.MANAGER,
              permissions: { create: keys.map((permission) => ({ permission })) },
            },
          });
          userIds[tag] = user.id;
        }
        const templateIds: Record<string, string> = {};
        for (const [tag, keys] of Object.entries(TEMPLATES)) {
          const template = await tx.permissionTemplate.create({
            data: {
              name: `t665-${tag}-${suffix}`,
              items: { create: keys.map((permission) => ({ permission })) },
            },
          });
          templateIds[tag] = template.id;
        }

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
        const countFixture = async () =>
          (await tx.userPermission.count({ where: { userId: { in: Object.values(userIds) } } })) +
          (await tx.permissionTemplateItem.count({
            where: { templateId: { in: Object.values(templateIds) } },
          }));

        const before = await countFixture();
        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }
        const afterFirst = await countFixture();

        const people: Record<string, { before: string[]; after: string[]; again: string[] }> = {};
        for (const [tag, keys] of Object.entries(PEOPLE)) {
          people[tag] = { before: [...keys].sort(), after: await held(userIds[tag]), again: [] };
        }

        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }
        const afterSecond = await countFixture();
        for (const tag of Object.keys(PEOPLE)) {
          people[tag].again = await held(userIds[tag]);
        }

        const templates: Record<string, { before: string[]; after: string[] }> = {};
        for (const [tag, keys] of Object.entries(TEMPLATES)) {
          templates[tag] = { before: [...keys].sort(), after: await offered(templateIds[tag]) };
        }

        result = {
          people,
          templates,
          inserted: afterFirst - before,
          insertedAgain: afterSecond - afterFirst,
        };
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    expect(result).toBeDefined();
    const { people, templates, inserted, insertedAgain } = result!;

    // The wave-180 lesson: a conditional backfill that inserts nothing looks exactly
    // like one that works until somebody counts.
    expect(inserted).toBeGreaterThan(0);
    expect(insertedAgain).toBe(0);

    for (const [tag, row] of Object.entries(people)) {
      // Nobody lost anything.
      expect({ tag, missing: row.before.filter((key) => !row.after.includes(key)) }).toEqual({
        tag,
        missing: [],
      });
      expect({ tag, after: row.after }).toEqual({ tag, after: expectedAfter(row.before) });
      expect(row.again).toEqual(row.after);
    }
    for (const [tag, row] of Object.entries(templates)) {
      expect({ tag, after: row.after }).toEqual({ tag, after: expectedAfter(row.before) });
    }

    // Spelled out, so a wrong `expectedAfter` cannot make the suite agree with itself.
    expect(people.carousels.after).toEqual([
      'carousels:read',
      'carousels:write',
      'home:read',
      'home:write',
    ]);
    expect(people.banners.after).toEqual([
      'banners:read',
      'banners:write',
      'home:read',
      'home:write',
      'orders:read',
      'pages:read',
      'pages:write',
    ]);
    expect(people.alreadyHome.after).toEqual([
      'categories:read',
      'categories:write',
      'home:read',
      'home:write',
    ]);
    expect(people.catalogue.after).not.toContain('home:write');
    expect(people.orders.after).toEqual(['orders:read', 'orders:write']);
    expect(people.nothing.after).toEqual([]);
    expect(templates.content.after).toEqual([
      'banners:read',
      'banners:write',
      'faq:read',
      'faq:write',
      'home:read',
      'home:write',
    ]);
    expect(templates.plain.after).toEqual(['orders:read']);
  });
});
