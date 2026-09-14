import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RolePermission, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MANAGER_BACKFILL_TEMPLATE_NAME } from '../src/auth/permissions/permission.catalog';
import { PrismaService } from '../src/prisma';

/**
 * The access model migration (TASK-474, plan 181) against a REAL Postgres.
 *
 * This is the only place two of its properties can actually be proven, because
 * both of them live in the database rather than in our code:
 *
 *   INVARIANT 1 — "exactly one owner". `User.isOwner` is the hinge of the whole
 *   level model (plan 178, decision 1). A unit test can assert that the schema
 *   asks for a partial unique index; only a real INSERT can show that the index
 *   exists, applies to `true` only, and rejects the second owner. A mocked test
 *   of "the service refuses to create a second owner" proves nothing about the
 *   `UPDATE users SET is_owner = true` somebody runs from psql at 2am.
 *
 *   INVARIANT 6 — "every live manager comes out holding exactly the set they had
 *   by role". Permissions move from the role to the person here, so the backfill
 *   is the single moment where an employee can silently gain or lose access, and
 *   nothing later in the wave can detect that it went wrong: after TASK-475 the
 *   guard simply reads `user_permissions` and believes it.
 *
 * It runs the REAL statements, not a copy of them: the migration marks its
 * backfill with `-- backfill:start` / `-- backfill:end`, and this spec slices
 * that block out of the file on disk and executes it. A hand-copied SQL fixture
 * would keep passing after somebody edited the migration.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */

const MIGRATIONS_ROOT = resolve(__dirname, '../prisma/migrations');

/** The migration's own backfill block, split into executable statements. */
const BACKFILL_STATEMENTS: string[] = (() => {
  const dir = readdirSync(MIGRATIONS_ROOT).find((entry) => entry.endsWith('_access_model'));
  if (!dir) {
    throw new Error(`No *_access_model migration under ${MIGRATIONS_ROOT}.`);
  }

  const sql = readFileSync(join(MIGRATIONS_ROOT, dir, 'migration.sql'), 'utf8');
  const start = sql.indexOf('-- backfill:start');
  const end = sql.indexOf('-- backfill:end');
  if (start < 0 || end < 0) {
    throw new Error(
      'The access-model migration has no `-- backfill:start` / `-- backfill:end` markers. ' +
        'They are what lets this spec exercise the shipped statements instead of a copy.',
    );
  }

  return sql
    .slice(start, end)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
})();

describe('access model backfill (TASK-474) — integration', () => {
  let prisma: PrismaService;

  /** Unique per run, so repeated runs never collide on `users.email`. */
  const suffix = randomUUID().slice(0, 8);
  const email = (tag: string) => `t474-${tag}-${suffix}@example.com`;

  const LIVE_MANAGER = email('live-manager');
  const DISABLED_MANAGER = email('disabled-manager');
  const DELETED_MANAGER = email('deleted-manager');
  const OWNER_A = email('owner-a');
  const OWNER_B = email('owner-b');
  const OWNER_C = email('owner-c');
  const FIXTURE_EMAILS = [
    LIVE_MANAGER,
    DISABLED_MANAGER,
    DELETED_MANAGER,
    OWNER_A,
    OWNER_B,
    OWNER_C,
  ];

  /** The matrix the backfill must reproduce on the person, row for row. */
  const GRANTED_TO_MANAGER = ['orders:read', 'orders:write', 'products:read'];
  /**
   * A grant the owner deliberately took away. `allowed = false` is not the same
   * as "never configured", and a backfill that copied it would hand back a key
   * somebody decided to remove — the exact failure this fixture exists to catch.
   */
  const REVOKED_FROM_MANAGER = 'analytics:read';

  const expectedPermissions = [...GRANTED_TO_MANAGER].sort();

  let liveManagerId: string;
  let disabledManagerId: string;
  let deletedManagerId: string;

  /**
   * Whatever MANAGER rows the test database already held. Replaced for the
   * duration of the run so "exactly this set" is a statement about a set we
   * control, and put back afterwards.
   */
  let savedManagerMatrix: RolePermission[] = [];

  const runBackfill = async () => {
    for (const statement of BACKFILL_STATEMENTS) {
      await prisma.$executeRawUnsafe(statement);
    }
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

    savedManagerMatrix = await prisma.rolePermission.findMany({
      where: { role: UserRole.MANAGER },
    });
    await prisma.rolePermission.deleteMany({ where: { role: UserRole.MANAGER } });
    await prisma.rolePermission.createMany({
      data: [
        ...GRANTED_TO_MANAGER.map((permission) => ({
          role: UserRole.MANAGER,
          permission,
          allowed: true,
        })),
        { role: UserRole.MANAGER, permission: REVOKED_FROM_MANAGER, allowed: false },
      ],
    });

    await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });

    const live = await prisma.user.create({
      data: { email: LIVE_MANAGER, passwordHash: 'x', role: UserRole.MANAGER, isActive: true },
    });
    liveManagerId = live.id;

    const disabled = await prisma.user.create({
      data: { email: DISABLED_MANAGER, passwordHash: 'x', role: UserRole.MANAGER, isActive: false },
    });
    disabledManagerId = disabled.id;

    const deleted = await prisma.user.create({
      data: {
        email: DELETED_MANAGER,
        passwordHash: 'x',
        role: UserRole.MANAGER,
        isActive: true,
        deletedAt: new Date(),
      },
    });
    deletedManagerId = deleted.id;
  });

  afterAll(async () => {
    // `user_permissions` and `permission_template_items` go with their parents
    // (both FKs cascade), which is itself part of what the migration promises.
    await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });
    await prisma.permissionTemplate.deleteMany({ where: { name: MANAGER_BACKFILL_TEMPLATE_NAME } });

    await prisma.rolePermission.deleteMany({ where: { role: UserRole.MANAGER } });
    if (savedManagerMatrix.length > 0) {
      await prisma.rolePermission.createMany({ data: savedManagerMatrix });
    }

    await prisma.$disconnect();
  });

  describe('the single-owner invariant', () => {
    it('lets the database, not the application, refuse a second owner', async () => {
      const priorOwner = await prisma.user.findFirst({
        where: { isOwner: true },
        select: { id: true },
      });
      await prisma.user.updateMany({ where: { isOwner: true }, data: { isOwner: false } });

      try {
        await prisma.user.create({
          data: { email: OWNER_A, passwordHash: 'x', role: UserRole.ADMIN, isOwner: true },
        });

        await expect(
          prisma.user.create({
            data: { email: OWNER_B, passwordHash: 'x', role: UserRole.ADMIN, isOwner: true },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });

        // And the index really is PARTIAL: it says nothing about accounts that
        // are not the owner, which is every other row in the table. A plain
        // unique index on the column would have allowed exactly one of these.
        await expect(
          prisma.user.create({
            data: { email: OWNER_C, passwordHash: 'x', role: UserRole.ADMIN, isOwner: false },
          }),
        ).resolves.toEqual(expect.objectContaining({ isOwner: false }));
      } finally {
        await prisma.user.deleteMany({ where: { email: { in: [OWNER_A, OWNER_B, OWNER_C] } } });
        await prisma.user.updateMany({ where: { isOwner: true }, data: { isOwner: false } });
        if (priorOwner) {
          await prisma.user.update({ where: { id: priorOwner.id }, data: { isOwner: true } });
        }
      }
    });
  });

  describe('the manager backfill', () => {
    beforeEach(async () => {
      await prisma.permissionTemplate.deleteMany({
        where: { name: MANAGER_BACKFILL_TEMPLATE_NAME },
      });
      await prisma.userPermission.deleteMany({
        where: { userId: { in: [liveManagerId, disabledManagerId, deletedManagerId] } },
      });

      await runBackfill();
    });

    it('gives a live manager exactly the set their role granted — no more, no less', async () => {
      const rows = await prisma.userPermission.findMany({
        where: { userId: liveManagerId },
        orderBy: { permission: 'asc' },
      });

      expect(rows.map((row) => row.permission)).toEqual(expectedPermissions);
      // Stated separately from the equality above, because this is the half a
      // careless `WHERE role = 'MANAGER'` would get wrong while still looking right.
      expect(rows.map((row) => row.permission)).not.toContain(REVOKED_FROM_MANAGER);
    });

    it('preserves that set as a template the owner can reapply', async () => {
      const template = await prisma.permissionTemplate.findUnique({
        where: { name: MANAGER_BACKFILL_TEMPLATE_NAME },
        include: { items: true },
      });

      expect(template).not.toBeNull();
      expect(template!.items.map((item) => item.permission).sort()).toEqual(expectedPermissions);
    });

    it('gives a deactivated or soft-deleted manager nothing at all', async () => {
      // Dormant rows are the worst outcome of a careless backfill: invisible
      // while the account is off, fully armed the moment somebody switches it
      // back on to "check something".
      await expect(
        prisma.userPermission.count({ where: { userId: disabledManagerId } }),
      ).resolves.toBe(0);
      await expect(
        prisma.userPermission.count({ where: { userId: deletedManagerId } }),
      ).resolves.toBe(0);
    });

    it('changes nothing when it runs a second time', async () => {
      const permissionsBefore = await prisma.userPermission.findMany({
        where: { userId: liveManagerId },
        orderBy: { permission: 'asc' },
      });
      const templateBefore = await prisma.permissionTemplate.findUnique({
        where: { name: MANAGER_BACKFILL_TEMPLATE_NAME },
        include: { items: { orderBy: { permission: 'asc' } } },
      });

      await runBackfill();

      const permissionsAfter = await prisma.userPermission.findMany({
        where: { userId: liveManagerId },
        orderBy: { permission: 'asc' },
      });
      const templateAfter = await prisma.permissionTemplate.findUnique({
        where: { name: MANAGER_BACKFILL_TEMPLATE_NAME },
        include: { items: { orderBy: { permission: 'asc' } } },
      });

      // Compared row-for-row including ids: a re-insert would produce new uuids
      // even though the counts matched, and a re-run that duplicated the
      // template would leave two sets of items behind.
      expect(permissionsAfter).toEqual(permissionsBefore);
      expect(templateAfter).toEqual(templateBefore);
    });
  });
});
