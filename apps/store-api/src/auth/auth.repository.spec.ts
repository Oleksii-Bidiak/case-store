import { createHash } from 'crypto';
import { AuthRepository } from './auth.repository';
import { PrismaService } from '../prisma';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  oAuthAccount: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  passwordResetToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

// ─── Test data ────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
  firstName: 'John',
  lastName: 'Doe',
  phone: null,
  role: 'CUSTOMER' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const rawToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-refresh-token';
const hashedToken = createHash('sha256').update(rawToken).digest('hex');

const mockRefreshTokenRecord = {
  id: 'rt-uuid-1',
  token: hashedToken,
  userId: 'user-uuid-1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isRevoked: false,
  createdAt: new Date(),
};

const mockRefreshTokenWithUser = {
  ...mockRefreshTokenRecord,
  user: mockUser,
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthRepository', () => {
  let repository: AuthRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new AuthRepository(prismaMock as unknown as PrismaService);
  });

  // ─── findByEmail ────────────────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('should return user when found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const result = await repository.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await repository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return user when found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const result = await repository.findById('user-uuid-1');

      expect(result).toEqual(mockUser);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
      });
    });

    it('should return null when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  // ─── createUser ─────────────────────────────────────────────────────────────

  describe('createUser', () => {
    it('should create and return a new user', async () => {
      const createInput = {
        email: 'new@example.com',
        passwordHash: 'hashed-password',
        firstName: 'Jane',
        lastName: 'Smith',
      };
      const createdUser = { ...mockUser, ...createInput, id: 'user-new-1' };
      prismaMock.user.create.mockResolvedValue(createdUser);

      const result = await repository.createUser(createInput);

      expect(result).toEqual(createdUser);
      expect(prismaMock.user.create).toHaveBeenCalledWith({ data: createInput });
    });
  });

  // ─── findRefreshToken (with SHA-256 hashing) ────────────────────────────────

  describe('findRefreshToken', () => {
    it('should hash the raw token with SHA-256 before lookup', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(mockRefreshTokenWithUser);

      await repository.findRefreshToken(rawToken);

      // The token passed to Prisma must be the SHA-256 hash, not the raw token
      expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: hashedToken },
        include: { user: true },
      });
    });

    it('should NOT pass the raw token to Prisma', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(mockRefreshTokenWithUser);

      await repository.findRefreshToken(rawToken);

      const callArgs = prismaMock.refreshToken.findUnique.mock.calls[0][0];
      expect(callArgs.where.token).not.toBe(rawToken);
      expect(callArgs.where.token).toBe(hashedToken);
    });

    it('should return token with user when found', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(mockRefreshTokenWithUser);

      const result = await repository.findRefreshToken(rawToken);

      expect(result).toEqual(mockRefreshTokenWithUser);
    });

    it('should return null when token not found', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      const result = await repository.findRefreshToken('nonexistent-token');

      expect(result).toBeNull();
    });

    it('should produce deterministic hash for the same token', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await repository.findRefreshToken(rawToken);
      await repository.findRefreshToken(rawToken);

      // Both calls should use the same hash
      const firstCallArgs = prismaMock.refreshToken.findUnique.mock.calls[0][0];
      const secondCallArgs = prismaMock.refreshToken.findUnique.mock.calls[1][0];
      expect(firstCallArgs.where.token).toBe(secondCallArgs.where.token);
    });
  });

  // ─── saveRefreshToken (with SHA-256 hashing) ───────────────────────────────

  describe('saveRefreshToken', () => {
    it('should hash the raw token with SHA-256 before storage', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      prismaMock.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      await repository.saveRefreshToken('user-uuid-1', rawToken, expiresAt);

      // The token stored in the database must be the SHA-256 hash
      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
        data: {
          token: hashedToken,
          userId: 'user-uuid-1',
          expiresAt,
        },
      });
    });

    it('should NOT store the raw token in the database', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      prismaMock.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      await repository.saveRefreshToken('user-uuid-1', rawToken, expiresAt);

      const callArgs = prismaMock.refreshToken.create.mock.calls[0][0];
      expect(callArgs.data.token).not.toBe(rawToken);
      expect(callArgs.data.token).toBe(hashedToken);
    });

    it('should return the created refresh token record', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      prismaMock.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      const result = await repository.saveRefreshToken('user-uuid-1', rawToken, expiresAt);

      expect(result).toEqual(mockRefreshTokenRecord);
    });

    it('should produce different hashes for different tokens', async () => {
      const otherRawToken = 'different-refresh-token-value';
      const otherHashedToken = createHash('sha256').update(otherRawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      prismaMock.refreshToken.create.mockResolvedValue(mockRefreshTokenRecord);

      await repository.saveRefreshToken('user-uuid-1', rawToken, expiresAt);
      await repository.saveRefreshToken('user-uuid-1', otherRawToken, expiresAt);

      const firstCallArgs = prismaMock.refreshToken.create.mock.calls[0][0];
      const secondCallArgs = prismaMock.refreshToken.create.mock.calls[1][0];

      expect(firstCallArgs.data.token).not.toBe(secondCallArgs.data.token);
      expect(firstCallArgs.data.token).toBe(hashedToken);
      expect(secondCallArgs.data.token).toBe(otherHashedToken);
    });
  });

  // ─── revokeToken ───────────────────────────────────────────────────────────

  describe('revokeToken', () => {
    it('should revoke a single token by ID', async () => {
      prismaMock.refreshToken.update.mockResolvedValue({
        ...mockRefreshTokenRecord,
        isRevoked: true,
      });

      await repository.revokeToken('rt-uuid-1');

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-uuid-1' },
        data: { isRevoked: true },
      });
    });
  });

  // ─── revokeAllUserTokens ────────────────────────────────────────────────────

  describe('revokeAllUserTokens', () => {
    it('should revoke all non-revoked tokens for a user', async () => {
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await repository.revokeAllUserTokens('user-uuid-1');

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', isRevoked: false },
        data: { isRevoked: true },
      });
    });
  });

  // ─── savePasswordResetToken (with SHA-256 hashing) ──────────────────────────

  describe('savePasswordResetToken', () => {
    it('should hash the raw token with SHA-256 before storage — never the raw token', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const created = { id: 'prt-1', token: hashedToken, userId: 'user-uuid-1', expiresAt };
      prismaMock.passwordResetToken.create.mockResolvedValue(created);

      await repository.savePasswordResetToken('user-uuid-1', rawToken, expiresAt);

      const callArgs = prismaMock.passwordResetToken.create.mock.calls[0][0];
      expect(callArgs.data.token).toBe(hashedToken);
      expect(callArgs.data.token).not.toBe(rawToken);
      expect(callArgs.data.userId).toBe('user-uuid-1');
      expect(callArgs.data.expiresAt).toBe(expiresAt);
    });
  });

  // ─── findPasswordResetToken (with SHA-256 hashing) ──────────────────────────

  describe('findPasswordResetToken', () => {
    it('should hash the raw token before lookup and include the user relation', async () => {
      const found = { id: 'prt-1', token: hashedToken, userId: 'user-uuid-1', user: mockUser };
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(found);

      const result = await repository.findPasswordResetToken(rawToken);

      expect(prismaMock.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { token: hashedToken },
        include: { user: true },
      });
      expect(result).toEqual(found);
    });

    it('should return null when the token is not found', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

      const result = await repository.findPasswordResetToken('nonexistent-token');

      expect(result).toBeNull();
    });
  });

  // ─── markPasswordResetTokenUsed ─────────────────────────────────────────────

  describe('markPasswordResetTokenUsed', () => {
    it('should set usedAt to a Date on the row identified by id', async () => {
      prismaMock.passwordResetToken.update.mockResolvedValue(undefined);

      await repository.markPasswordResetTokenUsed('prt-1');

      const callArgs = prismaMock.passwordResetToken.update.mock.calls[0][0];
      expect(callArgs.where).toEqual({ id: 'prt-1' });
      expect(callArgs.data.usedAt).toBeInstanceOf(Date);
    });
  });

  // ─── invalidateActivePasswordResetTokens ────────────────────────────────────

  describe('invalidateActivePasswordResetTokens', () => {
    it('should mark only unused, unexpired tokens for the user as used', async () => {
      prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

      await repository.invalidateActivePasswordResetTokens('user-uuid-1');

      const callArgs = prismaMock.passwordResetToken.updateMany.mock.calls[0][0];
      expect(callArgs.where.userId).toBe('user-uuid-1');
      expect(callArgs.where.usedAt).toBeNull();
      expect(callArgs.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(callArgs.data.usedAt).toBeInstanceOf(Date);
    });
  });

  // ─── updatePasswordHash ─────────────────────────────────────────────────────

  describe('updatePasswordHash', () => {
    it('should update the correct user by id with the new password hash', async () => {
      prismaMock.user.update.mockResolvedValue({ ...mockUser, passwordHash: 'new-hash' });

      await repository.updatePasswordHash('user-uuid-1', 'new-hash');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { passwordHash: 'new-hash' },
      });
    });
  });

  // ─── deleteExpiredAndRevoked ────────────────────────────────────────────────

  describe('deleteExpiredAndRevoked', () => {
    const now = new Date('2026-06-22T03:00:00.000Z');

    it('should delete rows that are expired OR revoked when no retention window', async () => {
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 5 });

      await repository.deleteExpiredAndRevoked(now);

      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ expiresAt: { lt: now } }, { isRevoked: true }],
        },
      });
    });

    it('should treat a retention window of 0 as no retention', async () => {
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      await repository.deleteExpiredAndRevoked(now, 0);

      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ expiresAt: { lt: now } }, { isRevoked: true }],
        },
      });
    });

    it('should apply a retention cutoff to revoked rows when retentionDays > 0', async () => {
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      const retentionDays = 7;
      const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);

      await repository.deleteExpiredAndRevoked(now, retentionDays);

      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ expiresAt: { lt: now } }, { isRevoked: true, createdAt: { lt: cutoff } }],
        },
      });
    });

    it('should return the number of deleted rows', async () => {
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 42 });

      const result = await repository.deleteExpiredAndRevoked(now);

      expect(result).toBe(42);
    });
  });

  // ─── findOAuthAccount (TASK-168) ────────────────────────────────────────────

  describe('findOAuthAccount', () => {
    const mockOAuthAccount = {
      id: 'oauth-uuid-1',
      provider: 'GOOGLE' as const,
      providerId: 'google-sub-123',
      userId: 'user-uuid-1',
      email: 'test@example.com',
      createdAt: new Date(),
      user: mockUser,
    };

    it('should look up by the compound (provider, providerId) unique including the user', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue(mockOAuthAccount);

      const result = await repository.findOAuthAccount('GOOGLE', 'google-sub-123');

      expect(result).toEqual(mockOAuthAccount);
      expect(prismaMock.oAuthAccount.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerId: { provider: 'GOOGLE', providerId: 'google-sub-123' },
        },
        include: { user: true },
      });
    });

    it('should return null when no link exists', async () => {
      prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);

      const result = await repository.findOAuthAccount('GOOGLE', 'unknown-sub');

      expect(result).toBeNull();
    });
  });

  // ─── linkOAuthAccount (TASK-168) ────────────────────────────────────────────

  describe('linkOAuthAccount', () => {
    it('should create the link row for an already-resolved user', async () => {
      const created = {
        id: 'oauth-uuid-2',
        provider: 'GOOGLE',
        providerId: 'google-sub-123',
        userId: 'user-uuid-1',
        email: 'test@example.com',
        createdAt: new Date(),
      };
      prismaMock.oAuthAccount.create.mockResolvedValue(created);

      const result = await repository.linkOAuthAccount(
        'user-uuid-1',
        'GOOGLE',
        'google-sub-123',
        'test@example.com',
      );

      expect(result).toEqual(created);
      expect(prismaMock.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid-1',
          provider: 'GOOGLE',
          providerId: 'google-sub-123',
          email: 'test@example.com',
        },
      });
    });
  });

  // ─── createUserFromOAuth (TASK-168) ─────────────────────────────────────────

  describe('createUserFromOAuth', () => {
    const oauthUser = { ...mockUser, passwordHash: null };
    const oauthAccount = {
      id: 'oauth-uuid-3',
      provider: 'GOOGLE',
      providerId: 'google-sub-123',
      userId: 'user-uuid-1',
      email: 'test@example.com',
      createdAt: new Date(),
    };

    it('should create the user (no password) and its OAuth link in one transaction', async () => {
      const txMock = {
        user: { create: jest.fn().mockResolvedValue(oauthUser) },
        oAuthAccount: { create: jest.fn().mockResolvedValue(oauthAccount) },
      };
      prismaMock.$transaction.mockImplementation(
        async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
      );

      const result = await repository.createUserFromOAuth({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        provider: 'GOOGLE',
        providerId: 'google-sub-123',
      });

      expect(result).toEqual({ user: oauthUser, oauthAccount });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      // The user row is created WITHOUT any passwordHash — a Google-only
      // account has genuinely no password (schema allows null since TASK-168) —
      // and with the role pinned explicitly to CUSTOMER (TASK-314). The schema
      // default is already CUSTOMER; stating it at the call site means an OAuth
      // signup can never inherit a different default if that default changes.
      expect(txMock.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'CUSTOMER',
        },
      });

      // The link row is created inside the SAME transaction, wired to the
      // freshly created user's id.
      expect(txMock.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          userId: oauthUser.id,
          provider: 'GOOGLE',
          providerId: 'google-sub-123',
          email: 'test@example.com',
        },
      });
    });
  });

  // ─── failed-login lockout (TASK-314) ────────────────────────────────────────

  describe('recordFailedLogin', () => {
    it('increments the counter atomically and returns the new value', async () => {
      prismaMock.user.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 3 });

      const attempts = await repository.recordFailedLogin('user-uuid-1', false);

      expect(attempts).toBe(3);
      // `increment` (not read-then-write): two simultaneous failed logins must
      // not lose an attempt to a stale read.
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { failedLoginAttempts: { increment: 1 } },
      });
    });

    it('restarts the window at 1 and clears the stale lock when asked', async () => {
      prismaMock.user.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 1 });

      const attempts = await repository.recordFailedLogin('user-uuid-1', true);

      expect(attempts).toBe(1);
      // An expired lock must not leave the counter parked at the threshold —
      // otherwise the very next mistyped password re-locks instantly, forever.
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { failedLoginAttempts: 1, lockedUntil: null },
      });
    });
  });

  describe('lockLoginUntil', () => {
    it('stores the lock deadline', async () => {
      const until = new Date(Date.now() + 15 * 60 * 1000);
      prismaMock.user.update.mockResolvedValue({ ...mockUser, lockedUntil: until });

      await repository.lockLoginUntil('user-uuid-1', until);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { lockedUntil: until },
      });
    });
  });

  describe('clearFailedLogins', () => {
    it('resets the counter and drops the lock', async () => {
      prismaMock.user.update.mockResolvedValue(mockUser);

      await repository.clearFailedLogins('user-uuid-1');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });
  });
});
