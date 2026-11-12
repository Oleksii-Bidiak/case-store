import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AuthRepository } from '../src/auth/auth.repository';
import { PrismaService } from '../src/prisma';

/**
 * `AuthRepository.rotateRefreshToken` against a REAL Postgres (TASK-496).
 *
 * The unit spec can only show that the insert and the revoke are queued into
 * one `$transaction`; it cannot show that Postgres actually rolls the revoke
 * back when the insert fails. That rollback is the whole fix: a refresh whose
 * replacement could not be saved must leave the presented token live, or the
 * client's retry reads as token theft and every session the user holds is
 * revoked.
 *
 * The failure is provoked the way it happened in production (TASK-463): the
 * replacement collides with an existing row on the unique `token` hash.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('AuthRepository.rotateRefreshToken (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: AuthRepository;

  const ns = `it-rot-${randomUUID().slice(0, 8)}`;
  const raw = (s: string) => `${ns}-${s}`;
  const expiresAt = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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
      data: { email: `${ns}-${randomUUID().slice(0, 8)}@example.test` },
    });
    userId = user.id;
  });

  afterEach(async () => {
    // Refresh tokens cascade with the user.
    await prisma.user.deleteMany({ where: { email: { startsWith: ns } } });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.user.deleteMany({ where: { email: { startsWith: ns } } });
    await app.close();
  });

  it('persists the replacement and revokes the presented token', async () => {
    const presented = await repo.saveRefreshToken(userId, raw('old'), expiresAt());

    const newTokenId = randomUUID();
    await expect(
      repo.rotateRefreshToken({
        oldTokenId: presented.id,
        newTokenId,
        userId,
        rawToken: raw('new'),
        expiresAt: expiresAt(),
      }),
    ).resolves.toBe(true);

    const old = await repo.findRefreshToken(raw('old'));
    const replacement = await repo.findRefreshToken(raw('new'));
    expect(old?.isRevoked).toBe(true);
    expect(replacement).not.toBeNull();
    expect(replacement?.isRevoked).toBe(false);
    expect(replacement?.userId).toBe(userId);
    // TASK-2405: the presented row records when and by whom it was replaced.
    expect(replacement?.id).toBe(newTokenId);
    expect(old?.replacedById).toBe(newTokenId);
    expect(old?.rotatedAt).toBeInstanceOf(Date);
    expect(old?.graceUsedAt).toBeNull();
  });

  // ─── TASK-2405: the rotation is conditional on the presented row being live ──

  it('rotates nothing for an already-revoked row: false, rolled back, nothing inserted', async () => {
    const presented = await repo.saveRefreshToken(userId, raw('old'), expiresAt());
    await repo.revokeToken(presented.id);

    await expect(
      repo.rotateRefreshToken({
        oldTokenId: presented.id,
        newTokenId: randomUUID(),
        userId,
        rawToken: raw('new'),
        expiresAt: expiresAt(),
      }),
    ).resolves.toBe(false);

    await expect(repo.findRefreshToken(raw('new'))).resolves.toBeNull();
    const old = await repo.findRefreshToken(raw('old'));
    expect(old?.rotatedAt).toBeNull();
    expect(old?.replacedById).toBeNull();
    await expect(prisma.refreshToken.count({ where: { userId } })).resolves.toBe(1);
  });

  it('two concurrent rotations of one row: exactly one wins, exactly one live successor', async () => {
    const presented = await repo.saveRefreshToken(userId, raw('old'), expiresAt());

    const results = await Promise.all(
      ['a', 'b'].map((side) =>
        repo.rotateRefreshToken({
          oldTokenId: presented.id,
          newTokenId: randomUUID(),
          userId,
          rawToken: raw(`new-${side}`),
          expiresAt: expiresAt(),
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(prisma.refreshToken.count({ where: { userId, isRevoked: false } })).resolves.toBe(
      1,
    );
    await expect(prisma.refreshToken.count({ where: { userId } })).resolves.toBe(2);
  });

  it('claimRefreshGrace succeeds exactly once, even when raced', async () => {
    const presented = await repo.saveRefreshToken(userId, raw('old'), expiresAt());

    const claims = await Promise.all([
      repo.claimRefreshGrace(presented.id),
      repo.claimRefreshGrace(presented.id),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(repo.claimRefreshGrace(presented.id)).resolves.toBe(false);
    const row = await repo.findRefreshTokenById(presented.id);
    expect(row?.graceUsedAt).toBeInstanceOf(Date);
  });

  it('rolls the revoke back when the replacement cannot be saved — the presented token stays live', async () => {
    const presented = await repo.saveRefreshToken(userId, raw('old'), expiresAt());
    // A row that already owns the replacement's hash: the insert must fail on
    // the unique `token` constraint, as it did for two same-second mints.
    await repo.saveRefreshToken(userId, raw('taken'), expiresAt());

    await expect(
      repo.rotateRefreshToken({
        oldTokenId: presented.id,
        newTokenId: randomUUID(),
        userId,
        rawToken: raw('taken'),
        expiresAt: expiresAt(),
      }),
    ).rejects.toThrow();

    const old = await repo.findRefreshToken(raw('old'));
    expect(old).not.toBeNull();
    expect(old?.isRevoked).toBe(false);
    // Exactly the two seeded rows — nothing half-written.
    await expect(prisma.refreshToken.count({ where: { userId } })).resolves.toBe(2);
  });
});
