import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaService } from '../src/prisma';
import { StaffRepository } from '../src/staff/staff.repository';
import { MANAGER_BACKFILL_TEMPLATE_NAME } from '../src/auth/permissions';

/**
 * The single-owner invariant (TASK-474, plan 181) against a REAL Postgres.
 *
 * `User.isOwner` is the hinge of the whole level model (plan 178, decision 1):
 * the owner is the one account nobody else may touch, and ownership transfer
 * (TASK-478) is the one operation where "two owners for 200ms" would mean two
 * people who can each lock the other out. A unit test can assert that the schema
 * ASKS for a partial unique index; only a real INSERT can show that the index
 * exists, applies to `true` only, and rejects the second owner. A mocked test of
 * "the service refuses to create a second owner" proves nothing about the
 * `UPDATE users SET is_owner = true` somebody runs from psql at 2am.
 *
 * INVARIANT 6 IS BACK, AND WHY IT HAD TO BE. This file also proves that the
 * TASK-474 backfill hands every manager exactly the set their role granted. Those
 * cases were removed once TASK-475 dropped `role_permissions`, on the reasoning
 * that the statements read a table that no longer exists and that what they
 * proved was a spent one-time event. Both halves of that were true and the
 * conclusion was still wrong: with the copy untested, the only thing left
 * guarding it was substring matching in `permission.catalog.spec.ts` — which
 * passes for SQL that filters on the wrong column, and did, for the whole
 * `is_active` defect the 2026-09-15 review found. A migration nobody executes is
 * a migration nobody has read carefully enough.
 *
 * The objection was "recreating the table means asserting against a fixture
 * rather than against the shipped migration". The answer is to recreate only the
 * SOURCE table and still execute the SHIPPED statements, sliced out of the file
 * by their `-- backfill:*` markers. The fixture then supplies the input, exactly
 * as the old shop's data did, and every predicate under test — which role, which
 * `allowed`, which liveness flag — is the one that shipped.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */

/** The shipped `20260914140000_access_model` migration, read off disk. */
function readAccessModelMigration(): string {
  const root = resolve(__dirname, '../prisma/migrations');
  const dir = readdirSync(root).find((entry) => entry.endsWith('_access_model'));
  if (!dir) {
    throw new Error(
      `No *_access_model migration under ${root}. Without it invariant 6 has nothing ` +
        'to execute, and a silently skipped backfill test is worse than none.',
    );
  }
  return readFileSync(join(root, dir, 'migration.sql'), 'utf8');
}

/**
 * The statements between `-- backfill:<name>:start` and `:end`, comments stripped.
 *
 * Sliced rather than copied: a copy is a second source of truth that drifts, and
 * the drift is invisible precisely because the test keeps passing.
 */
function backfillStatements(sql: string, name: string): string[] {
  const start = sql.indexOf(`-- backfill:${name}:start`);
  const end = sql.indexOf(`-- backfill:${name}:end`);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `The migration has no "-- backfill:${name}" block. The markers are load-bearing: ` +
        'they are how this test executes the shipped SQL instead of a copy of it.',
    );
  }

  return sql
    .slice(start, end)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

describe('the single-owner invariant (TASK-474) — integration', () => {
  let prisma: PrismaService;
  let staffRepository: StaffRepository;

  /** Unique per run, so repeated runs never collide on `users.email`. */
  const suffix = randomUUID().slice(0, 8);
  const email = (tag: string) => `t474-${tag}-${suffix}@example.com`;

  const OWNER_A = email('owner-a');
  const OWNER_B = email('owner-b');
  const OWNER_C = email('owner-c');
  const FIXTURE_EMAILS = [OWNER_A, OWNER_B, OWNER_C];

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, StaffRepository],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    staffRepository = moduleRef.get(StaffRepository);
    await prisma.$connect();

    await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });
    await prisma.$disconnect();
  });

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
      await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });
      await prisma.user.updateMany({ where: { isOwner: true }, data: { isOwner: false } });
      if (priorOwner) {
        await prisma.user.update({ where: { id: priorOwner.id }, data: { isOwner: true } });
      }
    }
  });

  /**
   * Lend the database to `body` with exactly two fixture accounts in it — an
   * owner and a deputy — and put the shop's real owner back afterwards whatever
   * happens. The seeded owner has to be parked because the index is global: a
   * fixture owner and the real one cannot coexist, which is the whole point.
   */
  async function withTwoAdmins(
    body: (ids: { ownerId: string; deputyId: string }) => Promise<void>,
  ): Promise<void> {
    const priorOwner = await prisma.user.findFirst({
      where: { isOwner: true },
      select: { id: true },
    });
    await prisma.user.updateMany({ where: { isOwner: true }, data: { isOwner: false } });

    try {
      const owner = await prisma.user.create({
        data: { email: OWNER_A, passwordHash: 'x', role: UserRole.ADMIN, isOwner: true },
      });
      const deputy = await prisma.user.create({
        data: { email: OWNER_B, passwordHash: 'x', role: UserRole.ADMIN, isOwner: false },
      });

      await body({ ownerId: owner.id, deputyId: deputy.id });
    } finally {
      await prisma.user.deleteMany({ where: { email: { in: FIXTURE_EMAILS } } });
      await prisma.user.updateMany({ where: { isOwner: true }, data: { isOwner: false } });
      if (priorOwner) {
        await prisma.user.update({ where: { id: priorOwner.id }, data: { isOwner: true } });
      }
    }
  }

  /**
   * The transfer itself, against the real index (TASK-478).
   *
   * `staff.repository.spec.ts` proves the write order against a FAKE index and
   * `staff.service.spec.ts` proves the rules around it; neither can show that the
   * order the code ships is the order Postgres actually permits. This is the case
   * that can: it calls the shipped `StaffRepository.transferOwnership` on a real
   * connection, and the assertion it really makes is that the transaction commits
   * at all — a partial unique index is checked statement by statement, not at
   * COMMIT, so the wrong order does not fail late, it fails here.
   */
  it('transfers ownership through the shipped repository, and the index permits it', async () => {
    await withTwoAdmins(async ({ ownerId, deputyId }) => {
      const result = await staffRepository.transferOwnership(ownerId, deputyId);

      expect(result.outgoing.isOwner).toBe(false);
      expect(result.incoming.isOwner).toBe(true);

      const owners = await prisma.user.findMany({
        where: { isOwner: true },
        select: { id: true },
      });
      expect(owners.map((o) => o.id)).toEqual([deputyId]);

      // The outgoing owner is left an ordinary deputy admin — the state
      // `PATCH :id/role` produces when an owner appoints one, and therefore a
      // state every other code path already knows how to handle.
      const before = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
      expect(before).toMatchObject({ isOwner: false, role: UserRole.ADMIN, isActive: true });
    });
  });

  it('rejects the naive write order and rolls the whole transfer back', async () => {
    await withTwoAdmins(async ({ ownerId, deputyId }) => {
      // Promote first, demote second — the order a reasonable author writes, and
      // the one this task exists to rule out. Postgres refuses the very first
      // statement, because for that instant two rows would carry `is_owner`.
      const naive = prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: deputyId }, data: { isOwner: true } });
        await tx.user.update({ where: { id: ownerId }, data: { isOwner: false } });
      });

      await expect(naive).rejects.toMatchObject({ code: 'P2002' });

      // And the shop still has the owner it started the transaction with — the
      // failure mode that matters is not "the transfer did not happen" but "the
      // shop ended up with nobody who can sign in as owner".
      const owners = await prisma.user.findMany({
        where: { isOwner: true },
        select: { id: true },
      });
      expect(owners.map((o) => o.id)).toEqual([ownerId]);
    });
  });

  /**
   * Invariant 6 — the manager copy, executed rather than grepped (TASK-474).
   *
   * Everything happens inside one interactive transaction that is deliberately
   * ROLLED BACK: the TEMP table lives on that single connection, nothing leaks
   * into `store_test`, and the four fixture managers never have to be cleaned up.
   */
  describe('the manager copy (invariant 6), replayed against real Postgres', () => {
    const MANAGER_LIVE = email('mgr-live');
    const MANAGER_OFF = email('mgr-off');
    const MANAGER_GONE = email('mgr-gone');
    const CUSTOMER = email('shopper');

    /** Rolled back always — see the describe docblock. */
    class Rollback extends Error {}

    async function replay<T>(
      body: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<T>,
    ): Promise<T> {
      let captured: T;
      try {
        await prisma.$transaction(async (tx) => {
          captured = await body(tx);
          throw new Rollback();
        });
      } catch (error) {
        if (!(error instanceof Rollback)) {
          throw error;
        }
      }
      return captured!;
    }

    it('copies every MANAGER grant onto every manager that is not a tombstone', async () => {
      const statements = backfillStatements(readAccessModelMigration(), 'manager-permissions');

      const granted = await replay(async (tx) => {
        // The SOURCE table, as it stood before TASK-475 dropped it. Only its
        // shape is recreated here; every predicate below comes from the shipped
        // statements.
        await tx.$executeRawUnsafe(`
          CREATE TEMP TABLE "role_permissions" (
            "id" TEXT PRIMARY KEY,
            "role" TEXT NOT NULL,
            "permission" TEXT NOT NULL,
            "allowed" BOOLEAN NOT NULL,
            "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE ("role", "permission")
          ) ON COMMIT DROP
        `);
        // Four rows, and two of them are the traps:
        //   - products:write has allowed = false, which is a DELIBERATE
        //     revocation rather than "never configured". The runtime reads
        //     allowed = true, so copying it would hand back a key the owner had
        //     taken away — a silent widening nobody performed.
        //   - audit:read belongs to ADMIN. A copy that dropped the role
        //     predicate would give a manager the action log.
        await tx.$executeRawUnsafe(`
          INSERT INTO "role_permissions" ("id", "role", "permission", "allowed") VALUES
            ('rp-1', 'MANAGER', 'orders:read',    true),
            ('rp-2', 'MANAGER', 'orders:write',   true),
            ('rp-3', 'MANAGER', 'products:write', false),
            ('rp-4', 'ADMIN',   'audit:read',     true)
        `);

        const mk = (address: string, role: UserRole, isActive: boolean, deleted: boolean) =>
          tx.user.create({
            data: {
              email: address,
              passwordHash: 'x',
              role,
              isActive,
              deletedAt: deleted ? new Date() : null,
            },
          });

        // «Менеджер (як було)» may already exist in this database from a real
        // migration run, so the template is asserted on the DELTA rather than on
        // its absolute contents: what these statements ADD is the property under
        // test, and it is the only part of it this fixture controls.
        const templateBefore = await tx.permissionTemplateItem.findMany({
          where: { template: { name: MANAGER_BACKFILL_TEMPLATE_NAME } },
          select: { permission: true },
        });

        const live = await mk(MANAGER_LIVE, UserRole.MANAGER, true, false);
        // On leave. `isActive` is a REVERSIBLE toggle, so this account must come
        // out of the migration holding its set — otherwise re-enabling it yields
        // an empty menu, and `role_permissions` is dropped by the next migration
        // so there is nothing left to restore from.
        const off = await mk(MANAGER_OFF, UserRole.MANAGER, false, false);
        // Tombstoned: set once, never cleared, email mangled, cannot sign in.
        const gone = await mk(MANAGER_GONE, UserRole.MANAGER, true, true);
        const shopper = await mk(CUSTOMER, UserRole.CUSTOMER, true, false);

        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }

        const rows = await tx.userPermission.findMany({
          where: { userId: { in: [live.id, off.id, gone.id, shopper.id] } },
          select: { userId: true, permission: true },
          orderBy: [{ userId: 'asc' }, { permission: 'asc' }],
        });

        const byUser = (id: string) =>
          rows.filter((row) => row.userId === id).map((row) => row.permission);

        const templateAfter = await tx.permissionTemplateItem.findMany({
          where: { template: { name: MANAGER_BACKFILL_TEMPLATE_NAME } },
          select: { permission: true },
        });
        const had = new Set(templateBefore.map((item) => item.permission));

        return {
          live: byUser(live.id),
          off: byUser(off.id),
          gone: byUser(gone.id),
          shopper: byUser(shopper.id),
          templateAdded: templateAfter
            .map((item) => item.permission)
            .filter((permission) => !had.has(permission))
            .sort(),
        };
      });

      // Row for row, not "at least": a copy that grants MORE than the role did is
      // as wrong as one that grants less, and only an exact set catches both.
      expect(granted.live).toEqual(['orders:read', 'orders:write']);
      expect(granted.off).toEqual(['orders:read', 'orders:write']);
      expect(granted.gone).toEqual([]);
      expect(granted.shopper).toEqual([]);

      // The same set kept under a name, so the shape of the job survives the move
      // off roles — this is «Менеджер (як було)» in AD-STAFF-11.
      // Exact on the DELTA: the revoked key and the other role's key must not
      // come along either, and an exact set is what catches both directions.
      expect(granted.templateAdded).toEqual(['orders:read', 'orders:write']);
    });

    it('runs twice with no second effect', async () => {
      const statements = backfillStatements(readAccessModelMigration(), 'manager-permissions');

      const counts = await replay(async (tx) => {
        await tx.$executeRawUnsafe(`
          CREATE TEMP TABLE "role_permissions" (
            "id" TEXT PRIMARY KEY,
            "role" TEXT NOT NULL,
            "permission" TEXT NOT NULL,
            "allowed" BOOLEAN NOT NULL,
            "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE ("role", "permission")
          ) ON COMMIT DROP
        `);
        await tx.$executeRawUnsafe(
          `INSERT INTO "role_permissions" ("id", "role", "permission", "allowed")
           VALUES ('rp-1', 'MANAGER', 'orders:read', true)`,
        );

        const manager = await tx.user.create({
          data: { email: MANAGER_LIVE, passwordHash: 'x', role: UserRole.MANAGER },
        });

        const run = async () => {
          for (const statement of statements) {
            await tx.$executeRawUnsafe(statement);
          }
          return tx.userPermission.count({ where: { userId: manager.id } });
        };

        // A re-runnable backfill is what makes restore-then-migrate safe, and it
        // is the one property `ON CONFLICT DO NOTHING` is here to provide.
        return { first: await run(), second: await run() };
      });

      expect(counts).toEqual({ first: 1, second: 1 });
    });
  });
});
