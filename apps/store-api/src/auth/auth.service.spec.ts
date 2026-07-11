import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthTokens } from './entities';
import { RegisterDto } from './dto';
import { MailOutboxService } from '../mail-outbox/mail-outbox.service';

// ─── Mock argon2 ──────────────────────────────────────────────────────────────

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const argon2 = require('argon2');

// ─── Mock factories ─────────────────────────────────────────────────────────

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

const mockRefreshTokenRecord = {
  id: 'rt-uuid-1',
  token: 'refresh-token-value',
  userId: 'user-uuid-1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  isRevoked: false,
  createdAt: new Date(),
  user: mockUser,
};

// ─── Config mock ─────────────────────────────────────────────────────────────

const testConfig: Record<string, string> = {
  JWT_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_EXPIRATION: '15m',
  JWT_REFRESH_EXPIRATION: '7d',
  PASSWORD_RESET_TOKEN_EXPIRATION: '1h',
  STORE_CLIENT_URL: 'http://localhost:3000',
};

const configMock = {
  get: jest.fn((key: string, defaultValue?: string) => {
    return testConfig[key] ?? defaultValue ?? '';
  }),
  getOrThrow: jest.fn((key: string) => {
    const value = testConfig[key];
    if (value === undefined) {
      throw new Error(`Configuration key "${key}" does not exist`);
    }
    return value;
  }),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: jest.Mocked<AuthRepository>;
  let jwtService: jest.Mocked<JwtService>;
  let mailOutboxService: jest.Mocked<MailOutboxService>;
  let loggerMock: { info: jest.Mock; error: jest.Mock; warn: jest.Mock; debug: jest.Mock };

  beforeEach(async () => {
    // Reset argon2 mocks before each test (clear call history AND re-arm resolves
    // so `.not.toHaveBeenCalled()` assertions are not polluted by prior tests).
    (argon2.hash as jest.Mock).mockClear().mockResolvedValue('hashed-password');
    (argon2.verify as jest.Mock).mockClear().mockResolvedValue(true);

    // Reset config mock call history
    configMock.get.mockClear();
    configMock.getOrThrow.mockClear();

    // Create a mock AuthRepository
    const authRepositoryMock = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      createUser: jest.fn(),
      findRefreshToken: jest.fn(),
      saveRefreshToken: jest.fn(),
      revokeToken: jest.fn(),
      revokeAllUserTokens: jest.fn(),
      savePasswordResetToken: jest.fn(),
      findPasswordResetToken: jest.fn(),
      markPasswordResetTokenUsed: jest.fn(),
      invalidateActivePasswordResetTokens: jest.fn(),
      updatePasswordHash: jest.fn(),
    };

    // Create a mock JwtService
    const jwtServiceMock = {
      sign: jest.fn(),
      verify: jest.fn(),
      verifyAsync: jest.fn(),
    };

    const mailOutboxServiceMock = {
      enqueuePasswordReset: jest.fn(),
      enqueueOrderConfirmation: jest.fn(),
      enqueueAccountLockedNotice: jest.fn(),
      // Default: nothing was sent recently, so the rate limit does not bite.
      hasRecentAccountLockedNotice: jest.fn().mockResolvedValue(false),
    };

    const pinoLoggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      setContext: jest.fn(),
    };
    loggerMock = pinoLoggerMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepositoryMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configMock },
        { provide: MailOutboxService, useValue: mailOutboxServiceMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    authRepository = module.get(AuthRepository) as jest.Mocked<AuthRepository>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
    mailOutboxService = module.get(MailOutboxService) as jest.Mocked<MailOutboxService>;
  });

  // ─── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'StrongP@ss123',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should throw ConflictException when email already exists', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(authRepository.findByEmail).toHaveBeenCalledWith(registerDto.email);
    });

    it('should create user and return tokens when email is new', async () => {
      authRepository.findByEmail.mockResolvedValue(null);
      authRepository.createUser.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValueOnce('access-token-value');
      jwtService.sign.mockReturnValueOnce('refresh-token-value');
      authRepository.saveRefreshToken.mockResolvedValue(mockRefreshTokenRecord);

      const result = await service.register(registerDto);

      expect(result).toBeInstanceOf(AuthTokens);
      expect(result.accessToken).toBe('access-token-value');
      expect(result.refreshToken).toBe('refresh-token-value');

      // Verify password was hashed with argon2
      expect(argon2.hash).toHaveBeenCalledWith(registerDto.password);

      // Verify user was created with hashed password
      expect(authRepository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
        }),
      );

      // Verify token pair was generated
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(authRepository.saveRefreshToken).toHaveBeenCalled();
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    const loginEmail = 'test@example.com';
    const loginPassword = 'StrongP@ss123';

    it('should throw UnauthorizedException when email not found', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(UnauthorizedException);
      expect(authRepository.findByEmail).toHaveBeenCalledWith(loginEmail);
    });

    it('burns a fixed argon2 cost when the email is unknown (TASK-274 timing hardening)', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      // Without this the no-user branch would return near-instantly while the
      // found-user branch pays for argon2.verify — a timing oracle for account
      // enumeration. The dummy hash equalizes the two.
      expect(argon2.hash).toHaveBeenCalledTimes(1);
      expect(authRepository.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginEmail, 'WrongPassword123')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(argon2.verify).toHaveBeenCalledWith(mockUser.passwordHash, 'WrongPassword123');
    });

    it('should return tokens when credentials are valid', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValueOnce('access-token-value');
      jwtService.sign.mockReturnValueOnce('refresh-token-value');
      authRepository.saveRefreshToken.mockResolvedValue(mockRefreshTokenRecord);

      const result = await service.login(loginEmail, loginPassword);

      expect(result).toBeInstanceOf(AuthTokens);
      expect(result.accessToken).toBe('access-token-value');
      expect(result.refreshToken).toBe('refresh-token-value');
      expect(argon2.verify).toHaveBeenCalledWith(mockUser.passwordHash, loginPassword);
      expect(authRepository.saveRefreshToken).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when the account is deactivated', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      // TASK-274: the SAME generic message as every other login failure — a
      // distinct "Account is deactivated" reply confirms the account exists.
      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      // A deactivated user must never receive new tokens.
      expect(authRepository.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when the account is soft-deleted', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, deletedAt: new Date() });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      // A soft-deleted (tombstoned) user must never receive new tokens.
      expect(authRepository.saveRefreshToken).not.toHaveBeenCalled();
    });
  });

  // ─── login → locked-account owner notice (TASK-287) ─────────────────────────
  //
  // The API response stays generic (TASK-274) — the truth is delivered out of
  // band, to the address that owns the account, and only to someone who already
  // proved knowledge of the password.

  describe('login — deactivated/soft-deleted owner notice', () => {
    const loginEmail = 'test@example.com';
    const loginPassword = 'StrongP@ss123';

    it('enqueues the notice when the password is correct but the account is deactivated', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(mailOutboxService.enqueueAccountLockedNotice).toHaveBeenCalledTimes(1);
      const [payload] = mailOutboxService.enqueueAccountLockedNotice.mock.calls[0];
      expect(payload.to).toBe(mockUser.email);
      expect(payload.supportUrl).toBe('http://localhost:3000/contact');
    });

    it('enqueues the notice when the password is correct but the account is soft-deleted', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, deletedAt: new Date() });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(mailOutboxService.enqueueAccountLockedNotice).toHaveBeenCalledTimes(1);
    });

    it('does NOT enqueue the notice when the password is wrong on a deactivated account', async () => {
      // Credential stuffing: a stranger holding a wrong password must not be
      // able to spray mail at the owner (nor confirm the account exists).
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginEmail, 'WrongPassword123')).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(mailOutboxService.enqueueAccountLockedNotice).not.toHaveBeenCalled();
    });

    it('does NOT enqueue the notice for an unknown email', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(mailOutboxService.enqueueAccountLockedNotice).not.toHaveBeenCalled();
    });

    it('does NOT enqueue the notice on a normal successful login', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValueOnce('access-token-value');
      jwtService.sign.mockReturnValueOnce('refresh-token-value');
      authRepository.saveRefreshToken.mockResolvedValue(mockRefreshTokenRecord);

      await service.login(loginEmail, loginPassword);

      expect(mailOutboxService.enqueueAccountLockedNotice).not.toHaveBeenCalled();
    });

    it('does NOT enqueue a second notice inside the rate-limit window', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      // A notice for this address already exists inside the window.
      mailOutboxService.hasRecentAccountLockedNotice.mockResolvedValue(true);

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(mailOutboxService.enqueueAccountLockedNotice).not.toHaveBeenCalled();
    });

    it('checks the rate limit against a window that starts N hours ago (default 24h)', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const before = Date.now();
      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(UnauthorizedException);

      expect(mailOutboxService.hasRecentAccountLockedNotice).toHaveBeenCalledTimes(1);
      const [recipient, since] = mailOutboxService.hasRecentAccountLockedNotice.mock.calls[0];
      expect(recipient).toBe(mockUser.email);
      const windowMs = before - since.getTime();
      // 24h ± a second of test execution time.
      expect(windowMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
      expect(windowMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
    });

    it('enqueues again once the window has elapsed (no recent notice found)', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      // First attempt: a notice already went out inside the window → suppressed.
      mailOutboxService.hasRecentAccountLockedNotice.mockResolvedValueOnce(true);
      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(UnauthorizedException);
      expect(mailOutboxService.enqueueAccountLockedNotice).not.toHaveBeenCalled();

      // Second attempt, window elapsed: the lookup finds nothing recent → sends.
      mailOutboxService.hasRecentAccountLockedNotice.mockResolvedValueOnce(false);
      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(UnauthorizedException);
      expect(mailOutboxService.enqueueAccountLockedNotice).toHaveBeenCalledTimes(1);
    });

    it('still answers with the generic message when enqueueing the notice fails', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      mailOutboxService.enqueueAccountLockedNotice.mockRejectedValue(new Error('db down'));

      // A mail-outbox hiccup must never turn a 401 into a 500 — that difference
      // would itself be an oracle.
      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });
  });

  // ─── refreshToken ───────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('should throw UnauthorizedException when token is invalid (not found)', async () => {
      authRepository.findRefreshToken.mockResolvedValue(null);

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke ALL user tokens and throw when revoked token is reused (reuse detection)', async () => {
      const revokedToken = {
        ...mockRefreshTokenRecord,
        isRevoked: true,
      };
      authRepository.findRefreshToken.mockResolvedValue(revokedToken);
      authRepository.revokeAllUserTokens.mockResolvedValue(undefined);

      await expect(service.refreshToken('revoked-token')).rejects.toThrow(
        new UnauthorizedException('Token reuse detected — all sessions terminated'),
      );

      // Must revoke ALL tokens for the user, not just the reused one
      expect(authRepository.revokeAllUserTokens).toHaveBeenCalledWith(mockUser.id);
      // Must NOT call revokeToken (single token) — the entire family is revoked
      expect(authRepository.revokeToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const expiredToken = {
        ...mockRefreshTokenRecord,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
      };
      authRepository.findRefreshToken.mockResolvedValue(expiredToken);

      await expect(service.refreshToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should revoke old token and return new pair (rotation)', async () => {
      authRepository.findRefreshToken.mockResolvedValue(mockRefreshTokenRecord);
      jwtService.sign.mockReturnValueOnce('new-access-token');
      jwtService.sign.mockReturnValueOnce('new-refresh-token');
      authRepository.saveRefreshToken.mockResolvedValue({
        ...mockRefreshTokenRecord,
        token: 'new-refresh-token',
      });

      const result = await service.refreshToken('refresh-token-value');

      expect(result).toBeInstanceOf(AuthTokens);
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');

      // Old token must be revoked
      expect(authRepository.revokeToken).toHaveBeenCalledWith(mockRefreshTokenRecord.id);

      // New refresh token must be persisted
      expect(authRepository.saveRefreshToken).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when the token owner is deactivated', async () => {
      authRepository.findRefreshToken.mockResolvedValue({
        ...mockRefreshTokenRecord,
        user: { ...mockUser, isActive: false },
      });

      await expect(service.refreshToken('refresh-token-value')).rejects.toThrow(
        new UnauthorizedException('Account is deactivated'),
      );

      // No rotation / new token issuance for a banned user.
      expect(authRepository.saveRefreshToken).not.toHaveBeenCalled();
    });
  });

  // ─── logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke all user tokens', async () => {
      authRepository.revokeAllUserTokens.mockResolvedValue(undefined);

      await service.logout('user-uuid-1');

      expect(authRepository.revokeAllUserTokens).toHaveBeenCalledWith('user-uuid-1');
    });
  });

  // ─── requestPasswordReset ────────────────────────────────────────────────────

  describe('requestPasswordReset', () => {
    it('silently no-ops for an unknown email — no token, no email', async () => {
      authRepository.findByEmail.mockResolvedValue(null);

      await expect(service.requestPasswordReset('missing@x.com')).resolves.toBeUndefined();

      expect(authRepository.savePasswordResetToken).not.toHaveBeenCalled();
      expect(mailOutboxService.enqueuePasswordReset).not.toHaveBeenCalled();
      // TASK-273: the no-op branch burns a fixed argon2 cost so its latency is
      // not a near-instant account-enumeration oracle.
      expect(argon2.hash).toHaveBeenCalledTimes(1);
    });

    it('silently no-ops for a deactivated user', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(service.requestPasswordReset(mockUser.email)).resolves.toBeUndefined();

      expect(authRepository.savePasswordResetToken).not.toHaveBeenCalled();
      expect(mailOutboxService.enqueuePasswordReset).not.toHaveBeenCalled();
      // TASK-273: fixed-cost dummy hash on the no-op branch (timing hardening).
      expect(argon2.hash).toHaveBeenCalledTimes(1);
    });

    it('silently no-ops for a soft-deleted user', async () => {
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, deletedAt: new Date() });

      await expect(service.requestPasswordReset(mockUser.email)).resolves.toBeUndefined();

      expect(authRepository.savePasswordResetToken).not.toHaveBeenCalled();
      expect(mailOutboxService.enqueuePasswordReset).not.toHaveBeenCalled();
      // TASK-273: fixed-cost dummy hash on the no-op branch (timing hardening).
      expect(argon2.hash).toHaveBeenCalledTimes(1);
    });

    it('invalidates prior tokens, saves a fresh token and enqueues the email for an active user', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      authRepository.savePasswordResetToken.mockResolvedValue(mockRefreshTokenRecord as never);

      await service.requestPasswordReset(mockUser.email);

      expect(authRepository.invalidateActivePasswordResetTokens).toHaveBeenCalledWith(mockUser.id);
      expect(authRepository.savePasswordResetToken).toHaveBeenCalledTimes(1);

      // The saved token expiry must be derived from PASSWORD_RESET_TOKEN_EXPIRATION (1h).
      const [savedUserId, savedRawToken, savedExpiresAt] =
        authRepository.savePasswordResetToken.mock.calls[0];
      expect(savedUserId).toBe(mockUser.id);
      const ttlMs = (savedExpiresAt as Date).getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(59 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);

      // The emailed link must carry the SAME raw token and the STORE_CLIENT_URL base.
      expect(mailOutboxService.enqueuePasswordReset).toHaveBeenCalledTimes(1);
      const [payload] = mailOutboxService.enqueuePasswordReset.mock.calls[0];
      expect(payload.to).toBe(mockUser.email);
      expect(payload.resetUrl).toContain('http://localhost:3000');
      expect(payload.resetUrl).toContain(savedRawToken as string);

      // TASK-273 regression guard: the found+active branch is intentionally
      // argon2-free — only the no-op branch burns the dummy hash cost.
      expect(argon2.hash).not.toHaveBeenCalled();
    });

    it('never logs the raw reset token', async () => {
      authRepository.findByEmail.mockResolvedValue(mockUser);
      authRepository.savePasswordResetToken.mockResolvedValue(mockRefreshTokenRecord as never);

      await service.requestPasswordReset(mockUser.email);

      const rawToken = authRepository.savePasswordResetToken.mock.calls[0][1] as string;
      const serializedLogs = JSON.stringify(loggerMock.info.mock.calls);
      expect(serializedLogs).not.toContain(rawToken);
    });
  });

  // ─── confirmPasswordReset ────────────────────────────────────────────────────

  describe('confirmPasswordReset', () => {
    const validRow = {
      id: 'prt-1',
      token: 'hashed',
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
      user: mockUser,
    };

    /** Capture the generic error message so tests 12–15 can assert it is identical. */
    async function messageFrom(promise: Promise<unknown>): Promise<string> {
      try {
        await promise;
        throw new Error('expected the call to throw');
      } catch (err) {
        return (err as Error).message;
      }
    }

    it('throws UnauthorizedException when the token is not found — no password change', async () => {
      authRepository.findPasswordResetToken.mockResolvedValue(null);

      await expect(service.confirmPasswordReset('bad-token', 'NewP@ss123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(argon2.hash).not.toHaveBeenCalled();
      expect(authRepository.updatePasswordHash).not.toHaveBeenCalled();
      expect(authRepository.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('throws the same generic error for not-found, used, expired and deactivated-owner cases', async () => {
      authRepository.findPasswordResetToken.mockResolvedValue(null);
      const notFoundMsg = await messageFrom(service.confirmPasswordReset('t', 'NewP@ss123'));

      authRepository.findPasswordResetToken.mockResolvedValue({
        ...validRow,
        usedAt: new Date(),
      } as never);
      const usedMsg = await messageFrom(service.confirmPasswordReset('t', 'NewP@ss123'));

      authRepository.findPasswordResetToken.mockResolvedValue({
        ...validRow,
        expiresAt: new Date(Date.now() - 1000),
      } as never);
      const expiredMsg = await messageFrom(service.confirmPasswordReset('t', 'NewP@ss123'));

      authRepository.findPasswordResetToken.mockResolvedValue({
        ...validRow,
        user: { ...mockUser, isActive: false },
      } as never);
      const deactivatedMsg = await messageFrom(service.confirmPasswordReset('t', 'NewP@ss123'));

      // Existence/state hiding: all four failure reasons return an identical message.
      expect(usedMsg).toBe(notFoundMsg);
      expect(expiredMsg).toBe(notFoundMsg);
      expect(deactivatedMsg).toBe(notFoundMsg);

      // None of the failing cases must mutate the password.
      expect(authRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('throws the generic error for a soft-deleted owner without changing the password', async () => {
      authRepository.findPasswordResetToken.mockResolvedValue({
        ...validRow,
        user: { ...mockUser, deletedAt: new Date() },
      } as never);

      await expect(service.confirmPasswordReset('t', 'NewP@ss123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('hashes the new password, updates it, marks the token used and revokes all sessions', async () => {
      authRepository.findPasswordResetToken.mockResolvedValue(validRow as never);
      (argon2.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      await service.confirmPasswordReset('valid-token', 'NewP@ss123');

      expect(argon2.hash).toHaveBeenCalledWith('NewP@ss123');
      expect(authRepository.updatePasswordHash).toHaveBeenCalledWith(
        mockUser.id,
        'new-hashed-password',
      );
      expect(authRepository.markPasswordResetTokenUsed).toHaveBeenCalledWith('prt-1');
      expect(authRepository.markPasswordResetTokenUsed).toHaveBeenCalledTimes(1);
      // The reset must terminate every other session (RFC-style forced re-login).
      expect(authRepository.revokeAllUserTokens).toHaveBeenCalledWith(mockUser.id);
      expect(authRepository.revokeAllUserTokens).toHaveBeenCalledTimes(1);
    });
  });

  // ─── generateTokenPair ────────────────────────────────────────────────────

  describe('generateTokenPair', () => {
    it('should use JWT_SECRET for access token and JWT_REFRESH_SECRET for refresh token', async () => {
      jwtService.sign.mockReturnValueOnce('access-token-value');
      jwtService.sign.mockReturnValueOnce('refresh-token-value');
      authRepository.saveRefreshToken.mockResolvedValue(mockRefreshTokenRecord);

      await service.generateTokenPair('user-uuid-1', 'CUSTOMER');

      // First call: access token with JWT_SECRET
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        1,
        { sub: 'user-uuid-1', role: 'CUSTOMER' },
        {
          secret: 'test-access-secret',
          expiresIn: '15m',
        },
      );

      // Second call: refresh token with JWT_REFRESH_SECRET
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        { sub: 'user-uuid-1', role: 'CUSTOMER', type: 'refresh' },
        {
          secret: 'test-refresh-secret',
          expiresIn: '7d',
        },
      );
    });
  });
});
