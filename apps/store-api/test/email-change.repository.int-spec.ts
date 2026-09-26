import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { EmailTokenPurpose, Prisma } from '@prisma/client';
import { AuthRepository } from '../src/auth/auth.repository';
import { PrismaService } from '../src/prisma';

/**
 * The three address-change writes of TASK-396 against a REAL Postgres.
 *
 * The unit and e2e specs run on fakes; what only a database can show is that
 * each write is one transaction that really ends the sessions, burns the right
 * links, and — on a unique clash with a concurrently registered address —
 * rolls back ENTIRELY, leaving the old login and every session exactly as
 * they were.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('AuthRepository — address change (integration, TASK-396)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: AuthRepository;

  const ns = `it-emc-${randomUUID().slice(0, 8)}`;
  const addr = (s: string) => `${ns}-${s}@example.test`;
  const raw = (s: string) => `${ns}-${s}`;
  const later = (ms = 60 * 60 * 1000) => new Date(Date.now() + ms);
  let userId: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, AuthRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(AuthRepository);
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: addr('old'), emailVerifiedAt: new Date('2026-09-01') },
    });
    userId = user.id;
  });

  afterEach(async () => {
    // Tokens of both kinds cascade with the user.
    await prisma.user.deleteMany({ where: { email: { contains: ns } } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { contains: ns } } });
    await app.close();
  });

  /** Seed one live session and the three kinds of link, the way a request leaves them. */
  async function seedPendingChange() {
    await repo.saveRefreshToken(userId, raw('session'), later());
    const verify = await repo.saveEmailVerificationToken(
      userId,
      addr('old'),
      raw('verify'),
      later(),
    );
    const change = await repo.saveEmailVerificationToken(
      userId,
      addr('new'),
      raw('change'),
      later(),
      { purpose: EmailTokenPurpose.EMAIL_CHANGE, previousEmail: addr('old') },
    );
    const revert = await repo.saveEmailVerificationToken(
      userId,
      addr('old'),
      raw('revert'),
      later(7 * 24 * 60 * 60 * 1000),
      { purpose: EmailTokenPurpose.EMAIL_CHANGE_REVERT, previousEmail: addr('old') },
    );
    return { verify, change, revert };
  }

  const liveSessions = () => prisma.refreshToken.count({ where: { userId, isRevoked: false } });
  const tokenById = (id: string) => prisma.emailVerificationToken.findUnique({ where: { id } });

  it('stores purpose and previousEmail on the link', async () => {
    const { change, verify } = await seedPendingChange();

    expect(change.purpose).toBe(EmailTokenPurpose.EMAIL_CHANGE);
    expect(change.previousEmail).toBe(addr('old'));
    // The default every pre-existing row got from the migration.
    expect(verify.purpose).toBe(EmailTokenPurpose.VERIFY);
    expect(verify.previousEmail).toBeNull();
  });

  it('scopes invalidation by purpose: verifying again does not burn the revert link', async () => {
    const { verify, change, revert } = await seedPendingChange();

    await repo.invalidateActiveEmailVerificationTokens(userId);

    expect((await tokenById(verify.id))?.usedAt).not.toBeNull();
    expect((await tokenById(change.id))?.usedAt).toBeNull();
    expect((await tokenById(revert.id))?.usedAt).toBeNull();
  });

  it('applyEmailChange: new login, proven, every session revoked, only the revert link left alive', async () => {
    const { verify, change, revert } = await seedPendingChange();
    expect(await liveSessions()).toBe(1);

    await repo.applyEmailChange({
      userId,
      tokenId: change.id,
      newEmail: addr('new'),
      verifiedAt: new Date(),
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(addr('new'));
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(await liveSessions()).toBe(0);
    expect((await tokenById(change.id))?.usedAt).not.toBeNull();
    expect((await tokenById(verify.id))?.usedAt).not.toBeNull();
    expect((await tokenById(revert.id))?.usedAt).toBeNull();
  });

  it('applyEmailChange rolls back COMPLETELY when the address was registered meanwhile (P2002)', async () => {
    const { change } = await seedPendingChange();
    await prisma.user.create({ data: { email: addr('new') } });

    const attempt = repo.applyEmailChange({
      userId,
      tokenId: change.id,
      newEmail: addr('new'),
      verifiedAt: new Date(),
    });

    await expect(attempt).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(attempt).rejects.toMatchObject({ code: 'P2002' });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(addr('old'));
    // Nothing else in the transaction survived: the session lives, the link is unspent.
    expect(await liveSessions()).toBe(1);
    expect((await tokenById(change.id))?.usedAt).toBeNull();
  });

  it('revertEmailChange: old login back, every link burned, every session revoked', async () => {
    const { change, revert } = await seedPendingChange();
    await repo.applyEmailChange({
      userId,
      tokenId: change.id,
      newEmail: addr('new'),
      verifiedAt: new Date(),
    });
    // The attacker signs in with the new address.
    await repo.saveRefreshToken(userId, raw('attacker-session'), later());

    await repo.revertEmailChange({
      userId,
      tokenId: revert.id,
      restoreEmail: addr('old'),
      verifiedAt: new Date(),
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(addr('old'));
    expect(await liveSessions()).toBe(0);
    expect(await prisma.emailVerificationToken.count({ where: { userId, usedAt: null } })).toBe(0);
  });

  it('setUnverifiedEmail: the operator path leaves the address UNPROVEN and ends every session', async () => {
    await seedPendingChange();

    await repo.setUnverifiedEmail(userId, addr('operator'));

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(addr('operator'));
    expect(user.emailVerifiedAt).toBeNull();
    expect(await liveSessions()).toBe(0);
    expect(await prisma.emailVerificationToken.count({ where: { userId, usedAt: null } })).toBe(0);
  });
});
