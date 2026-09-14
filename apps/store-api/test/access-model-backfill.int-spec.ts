import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';

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
 * WHAT USED TO BE HERE AND IS NOT ANY MORE. This file also proved invariant 6 —
 * that the TASK-474 backfill handed every live manager exactly the set their role
 * granted — by slicing the `-- backfill:*` block out of the migration and running
 * it against a real database. Those cases went with `role_permissions` itself,
 * which TASK-475 drops: the statements they executed read a table that no longer
 * exists, so the suite could only have been kept by recreating the table inside
 * the test, i.e. by asserting against a fixture rather than against the shipped
 * migration. What they proved was a one-time historical event — the copy happened
 * once, in the release that introduced it — whereas the case below is a rule that
 * has to hold forever. A permanent test and a spent one do not belong together.
 * `permission.catalog.spec.ts` still pins the migration's SQL against the code.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */

describe('the single-owner invariant (TASK-474) — integration', () => {
  let prisma: PrismaService;

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
      providers: [PrismaService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
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
});
