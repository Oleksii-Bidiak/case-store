import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OAuthProvider } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthTokens } from './entities';
import { RegisterDto } from './dto';
import { GoogleOAuthProfile } from './oauth/google-oauth-profile';
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
      findOAuthAccount: jest.fn(),
      linkOAuthAccount: jest.fn(),
      createUserFromOAuth: jest.fn(),
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

    it('rejects generically (with the timing burn) when the user has no password hash — Google-only account (TASK-168)', async () => {
      // A Google-only account has passwordHash: null. An unmodified login()
      // would crash inside argon2.verify — a distinguishable failure mode,
      // violating the TASK-274 generic-refusal policy. It must instead behave
      // exactly like the unknown-email branch.
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: null });

      await expect(service.login(loginEmail, loginPassword)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      // Same timing burn as the unknown-email case — no timing oracle.
      expect(argon2.hash).toHaveBeenCalledTimes(1);
      // argon2.verify must NEVER see a null hash.
      expect(argon2.verify).not.toHaveBeenCalled();
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

  // ─── loginWithGoogleProfile (TASK-168) ──────────────────────────────────────
  //
  // Account resolution for the Google OAuth callback: link-by-verified-email /
  // auto-provision / locked-account refusal. Locked accounts get the exact
  // same generic INVALID_CREDENTIALS_MESSAGE + notifyLockedAccountOwner
  // mechanism as login() (TASK-274/287 policy applied literally).

  describe('loginWithGoogleProfile', () => {
    const googleProfile: GoogleOAuthProfile = {
      providerId: 'google-sub-123',
      email: 'test@example.com',
      emailVerified: true,
      firstName: 'John',
      lastName: 'Doe',
      redirect: '/',
    };

    const mockOAuthLink = {
      id: 'oauth-uuid-1',
      provider: OAuthProvider.GOOGLE,
      providerId: 'google-sub-123',
      userId: mockUser.id,
      email: mockUser.email,
      createdAt: new Date(),
      user: mockUser,
    };

    let generateTokenPairSpy: jest.SpyInstance;

    beforeEach(() => {
      const tokens = new AuthTokens();
      tokens.accessToken = 'access-token-value';
      tokens.refreshToken = 'refresh-token-value';
      generateTokenPairSpy = jest.spyOn(service, 'generateTokenPair').mockResolvedValue(tokens);
    });

    it('rejects an unverified Google email BEFORE any repository access', async () => {
      // This is a fact about the caller's GOOGLE account, not ours, so —
      // unlike every other rejection here — a distinct message is safe.
      await expect(
        service.loginWithGoogleProfile({ ...googleProfile, emailVerified: false }),
      ).rejects.toThrow(new UnauthorizedException("Google account's email is not verified"));

      // The DB is never even queried — an unverified email can't be used to
      // probe whether a matching store account exists.
      expect(authRepository.findOAuthAccount).not.toHaveBeenCalled();
      expect(authRepository.findByEmail).not.toHaveBeenCalled();
      expect(generateTokenPairSpy).not.toHaveBeenCalled();
    });

    it('rejects a profile without an email (scope not granted) the same way', async () => {
      await expect(
        service.loginWithGoogleProfile({ ...googleProfile, email: null }),
      ).rejects.toThrow(new UnauthorizedException("Google account's email is not verified"));

      expect(authRepository.findOAuthAccount).not.toHaveBeenCalled();
      expect(authRepository.findByEmail).not.toHaveBeenCalled();
      expect(generateTokenPairSpy).not.toHaveBeenCalled();
    });

    it('issues tokens for a returning linked user via the providerId fast path', async () => {
      authRepository.findOAuthAccount.mockResolvedValue(mockOAuthLink);

      const result = await service.loginWithGoogleProfile(googleProfile);

      expect(result.accessToken).toBe('access-token-value');
      expect(authRepository.findOAuthAccount).toHaveBeenCalledWith(
        OAuthProvider.GOOGLE,
        'google-sub-123',
      );
      expect(generateTokenPairSpy).toHaveBeenCalledWith(mockUser.id, mockUser.role);
      // Resolved via providerId first — the email lookup never runs.
      expect(authRepository.findByEmail).not.toHaveBeenCalled();
      // Nothing new to link.
      expect(authRepository.linkOAuthAccount).not.toHaveBeenCalled();
    });

    it('refuses a linked but deactivated user generically and notifies the owner', async () => {
      authRepository.findOAuthAccount.mockResolvedValue({
        ...mockOAuthLink,
        user: { ...mockUser, isActive: false },
      });

      await expect(service.loginWithGoogleProfile(googleProfile)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(mailOutboxService.enqueueAccountLockedNotice).toHaveBeenCalledTimes(1);
      expect(generateTokenPairSpy).not.toHaveBeenCalled();
    });

    it('refuses a linked but soft-deleted user the same way', async () => {
      authRepository.findOAuthAccount.mockResolvedValue({
        ...mockOAuthLink,
        user: { ...mockUser, deletedAt: new Date() },
      });

      await expect(service.loginWithGoogleProfile(googleProfile)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(mailOutboxService.enqueueAccountLockedNotice).toHaveBeenCalledTimes(1);
      expect(generateTokenPairSpy).not.toHaveBeenCalled();
    });

    it('links an existing active CUSTOMER account by verified email, preserving its role', async () => {
      // The role must survive the link untouched — no silent downgrade, no
      // silent upgrade (plan 153 §Risks). Since TASK-314 this guard can only be
      // written with a CUSTOMER: a privileged role is refused outright (see the
      // TASK-314 block below), so "preserved" and "CUSTOMER" now coincide.
      authRepository.findOAuthAccount.mockResolvedValue(null);
      authRepository.findByEmail.mockResolvedValue(mockUser);

      const result = await service.loginWithGoogleProfile(googleProfile);

      expect(result.accessToken).toBe('access-token-value');
      expect(authRepository.linkOAuthAccount).toHaveBeenCalledTimes(1);
      expect(authRepository.linkOAuthAccount).toHaveBeenCalledWith(
        mockUser.id,
        OAuthProvider.GOOGLE,
        'google-sub-123',
        googleProfile.email,
      );
      expect(generateTokenPairSpy).toHaveBeenCalledWith(mockUser.id, 'CUSTOMER');
    });

    it('never links a locked account resolved by email — no silent reactivation side channel', async () => {
      authRepository.findOAuthAccount.mockResolvedValue(null);
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, isActive: false });

      await expect(service.loginWithGoogleProfile(googleProfile)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      // The lock check must run BEFORE any link write — a banned account must
      // never accumulate a working OAuth link.
      expect(authRepository.linkOAuthAccount).not.toHaveBeenCalled();
      expect(mailOutboxService.enqueueAccountLockedNotice).toHaveBeenCalledTimes(1);
      expect(generateTokenPairSpy).not.toHaveBeenCalled();
    });

    it('auto-provisions a brand-new user (Google doubles as registration)', async () => {
      const newUser = { ...mockUser, id: 'user-uuid-new', passwordHash: null };
      authRepository.findOAuthAccount.mockResolvedValue(null);
      authRepository.findByEmail.mockResolvedValue(null);
      authRepository.createUserFromOAuth.mockResolvedValue({
        user: newUser,
        oauthAccount: { ...mockOAuthLink, userId: newUser.id },
      });

      const result = await service.loginWithGoogleProfile(googleProfile);

      expect(result.accessToken).toBe('access-token-value');
      expect(authRepository.createUserFromOAuth).toHaveBeenCalledWith({
        email: googleProfile.email,
        firstName: googleProfile.firstName,
        lastName: googleProfile.lastName,
        provider: OAuthProvider.GOOGLE,
        providerId: googleProfile.providerId,
      });
      expect(generateTokenPairSpy).toHaveBeenCalledWith(newUser.id, newUser.role);
      // The transaction inside createUserFromOAuth already created the link.
      expect(authRepository.linkOAuthAccount).not.toHaveBeenCalled();
      expect(mailOutboxService.enqueueAccountLockedNotice).not.toHaveBeenCalled();
    });

    // ─── TASK-314: the storefront's Google button is CUSTOMER-only ────────────
    //
    // Owner decision, 2026-07-27: storefront Google sign-in may NEVER mint a
    // token for a role other than CUSTOMER. Staff sign in with a password (plus
    // 2FA later). Without this gate, any ADMIN row whose email happens to be a
    // Gmail address turns Google's consent screen into a full admin login —
    // bypassing the store's password policy, is-strong-app-password and any
    // future lockout, and moving the whole trust boundary onto that Google
    // account. There is deliberately no env toggle: the rule is hardcoded.

    /** The single server-side event that records a blocked privileged login. */
    const blockedEvents = (): Array<Record<string, unknown>> =>
      loggerMock.warn.mock.calls
        .map((call) => call[0] as Record<string, unknown>)
        .filter((payload) => payload?.event === 'auth.googleAdminBlocked');

    it('refuses a linked ADMIN account with the generic message and issues no token', async () => {
      authRepository.findOAuthAccount.mockResolvedValue({
        ...mockOAuthLink,
        user: { ...mockUser, role: 'ADMIN' as const },
      });

      // Indistinguishable from every other refusal in this file — never
      // "you are an admin, use the admin login", which would confirm both the
      // account's existence and its privilege level.
      await expect(service.loginWithGoogleProfile(googleProfile)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(generateTokenPairSpy).not.toHaveBeenCalled();

      // The truth stays on the server, where the operator can alert on it.
      expect(blockedEvents()).toHaveLength(1);
      expect(blockedEvents()[0].userId).toBe(mockUser.id);
    });

    it('refuses an ADMIN matched by verified email and never links the OAuth identity', async () => {
      authRepository.findOAuthAccount.mockResolvedValue(null);
      authRepository.findByEmail.mockResolvedValue({ ...mockUser, role: 'ADMIN' as const });

      await expect(service.loginWithGoogleProfile(googleProfile)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      // A refused login must leave no trace that would make the next attempt
      // succeed — the same "reject before any side effect" rule the lock check
      // follows (TASK-168, plan 153 §Locked-account resolution).
      expect(authRepository.linkOAuthAccount).not.toHaveBeenCalled();
      expect(generateTokenPairSpy).not.toHaveBeenCalled();
      expect(blockedEvents()).toHaveLength(1);
    });

    it('checks the account lock BEFORE the role gate — a deactivated ADMIN is refused as locked', async () => {
      authRepository.findOAuthAccount.mockResolvedValue({
        ...mockOAuthLink,
        user: { ...mockUser, role: 'ADMIN' as const, isActive: false },
      });

      await expect(service.loginWithGoogleProfile(googleProfile)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      // Order is load-bearing. If the role gate ran first, the two states
      // ("there is an ADMIN with this email" vs "there is a locked account
      // with this email") would produce different side effects — the owner
      // notice fires for one and not the other — recreating exactly the kind
      // of oracle TASK-274/287 exists to remove.
      expect(mailOutboxService.enqueueAccountLockedNotice).toHaveBeenCalledTimes(1);
      expect(blockedEvents()).toHaveLength(0);
      expect(generateTokenPairSpy).not.toHaveBeenCalled();
    });

    it('never issues a token when auto-provisioning returns a non-CUSTOMER row', async () => {
      // Defence in depth: the rule is enforced at the single token-issuance
      // choke point, so a future change to createUserFromOAuth (or a seed that
      // pre-creates the row) cannot reopen the hole through the signup branch.
      authRepository.findOAuthAccount.mockResolvedValue(null);
      authRepository.findByEmail.mockResolvedValue(null);
      authRepository.createUserFromOAuth.mockResolvedValue({
        user: { ...mockUser, id: 'user-uuid-new', passwordHash: null, role: 'ADMIN' as const },
        oauthAccount: { ...mockOAuthLink, userId: 'user-uuid-new' },
      });

      await expect(service.loginWithGoogleProfile(googleProfile)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );

      expect(generateTokenPairSpy).not.toHaveBeenCalled();
      expect(blockedEvents()).toHaveLength(1);
    });

    it('does not log the block event on a normal CUSTOMER sign-in', async () => {
      authRepository.findOAuthAccount.mockResolvedValue(mockOAuthLink);

      await service.loginWithGoogleProfile(googleProfile);

      expect(blockedEvents()).toHaveLength(0);
      expect(generateTokenPairSpy).toHaveBeenCalledWith(mockUser.id, 'CUSTOMER');
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
