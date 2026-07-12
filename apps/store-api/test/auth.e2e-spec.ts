import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { GoogleAuthGuard } from '../src/auth/guards/google-auth.guard';
import { GoogleOAuthProfile } from '../src/auth/oauth/google-oauth-profile';
import { PrismaService } from '../src/prisma';
import * as argon2 from 'argon2';

// Google OAuth must stay UNCONFIGURED for this suite: part of what the Google
// cases below prove is that AppModule boots with ZERO Google env vars
// (GoogleStrategy constructs with inert placeholders — TASK-168) and the two
// Google routes answer 503 through the real GoogleAuthGuard. An empty string
// is still "set", so ConfigModule's dotenv load cannot re-introduce a
// developer's local value (same technique setup-e2e.ts uses for REDIS_HOST).
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';

/**
 * E2E tests for the Auth module.
 *
 * Uses mocked AuthRepository and PrismaService to avoid requiring
 * a real database connection. This mocks at the clean architecture
 * boundary (repository layer), keeping the full HTTP pipeline intact.
 *
 * ThrottlerGuard is overridden with a pass-through guard to avoid
 * rate limiting issues during test execution.
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

/**
 * Controllable stand-in for the route-level GoogleAuthGuard (same subclass
 * technique as ThrottlerGuardPassThrough above). Unarmed (default) it defers
 * to the REAL guard — which, with the zero-Google-env boot pinned at the top
 * of this file, answers 503: exactly the production code path the
 * "unconfigured" case asserts. When a test arms it via inject(), it skips the
 * passport handshake (no real OAuth round trip exists in e2e) and stashes the
 * given normalized profile on req.user — `undefined` models a Google-side
 * denial/cancel — so the real callback handler, AuthService, and the mocked
 * repository seam below all run untouched.
 */
class GoogleAuthGuardTestDouble extends GoogleAuthGuard {
  private static armed = false;
  private static profile: GoogleOAuthProfile | undefined;

  static inject(profile: GoogleOAuthProfile | undefined): void {
    GoogleAuthGuardTestDouble.armed = true;
    GoogleAuthGuardTestDouble.profile = profile;
  }

  static reset(): void {
    GoogleAuthGuardTestDouble.armed = false;
    GoogleAuthGuardTestDouble.profile = undefined;
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    if (!GoogleAuthGuardTestDouble.armed) {
      return super.canActivate(context);
    }
    context.switchToHttp().getRequest<{ user?: GoogleOAuthProfile }>().user =
      GoogleAuthGuardTestDouble.profile;
    return true;
  }
}

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Mock AuthRepository — clean architecture boundary
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

  // Mock PrismaService — prevents database connection errors
  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    // The real MailOutboxService (enqueuePasswordReset) writes through this.
    mailOutbox: {
      create: jest.fn().mockResolvedValue({ id: 'outbox-e2e-1' }),
      // hasRecentAccountLockedNotice (TASK-287 rate limit) reads through this;
      // null → "not notified recently" → the locked-account notice enqueues.
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const testUser = {
    email: 'e2e-test@example.com',
    password: 'TestP@ss123',
    firstName: 'E2E',
    lastName: 'Tester',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env'],
        }),
        // Override ThrottlerModule with very high limits for tests
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      // Override ThrottlerGuard with pass-through to avoid rate limiting in tests
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      // Controllable Google guard: real 503 gate by default, injected profile
      // when a test arms it (see GoogleAuthGuardTestDouble above).
      .overrideGuard(GoogleAuthGuard)
      .useClass(GoogleAuthGuardTestDouble)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Refresh token is read from an HttpOnly cookie — mirror main.ts so the
    // JwtRefreshStrategy can extract it from req.cookies.
    app.use(cookieParser());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    app.setGlobalPrefix('api', {
      exclude: ['health'],
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Reset mocks between tests
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Register ──────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('should register a new user and return 201 with access token', async () => {
      authRepositoryMock.findByEmail.mockResolvedValue(null);
      authRepositoryMock.createUser.mockImplementation(async (data: Record<string, unknown>) => ({
        id: 'user-e2e-1',
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        role: 'CUSTOMER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      authRepositoryMock.saveRefreshToken.mockImplementation(
        async (userId: string, token: string) => ({
          id: 'rt-e2e-1',
          token,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          isRevoked: false,
          createdAt: new Date(),
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(typeof response.body.data.accessToken).toBe('string');
      expect(response.body.data.accessToken.length).toBeGreaterThan(0);

      // Should set refreshToken cookie
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
    });

    it('should return 409 when registering with an existing email', async () => {
      authRepositoryMock.findByEmail.mockResolvedValue({
        id: 'user-existing',
        email: testUser.email,
        role: 'CUSTOMER',
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 when registering with invalid data', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'short',
        })
        .expect(400);
    });
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and return 200 with access token', async () => {
      const passwordHash = await argon2.hash(testUser.password);

      authRepositoryMock.findByEmail.mockResolvedValue({
        id: 'user-e2e-1',
        email: testUser.email,
        passwordHash,
        role: 'CUSTOMER',
        isActive: true,
      });
      authRepositoryMock.saveRefreshToken.mockImplementation(
        async (userId: string, token: string) => ({
          id: 'rt-e2e-1',
          token,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          isRevoked: false,
          createdAt: new Date(),
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(typeof response.body.data.accessToken).toBe('string');

      // Should set refreshToken cookie
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
    });

    it('should return 401 when login with wrong password', async () => {
      const passwordHash = await argon2.hash('CorrectP@ss123');

      authRepositoryMock.findByEmail.mockResolvedValue({
        id: 'user-e2e-1',
        email: testUser.email,
        passwordHash,
        role: 'CUSTOMER',
        isActive: true,
      });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123',
        })
        .expect(401);
    });

    it('should return 401 when login with non-existent email', async () => {
      authRepositoryMock.findByEmail.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomeP@ss123',
        })
        .expect(401);
    });
  });

  // ─── Refresh ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('should return 401 when refreshing without a token', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
    });
  });

  // ─── Deactivated user — authentication blocked (TASK-063) ────────────────────

  describe('Deactivated user — authentication blocked', () => {
    it('should return 401 when a deactivated user logs in with valid credentials', async () => {
      const passwordHash = await argon2.hash(testUser.password);

      authRepositoryMock.findByEmail.mockResolvedValue({
        id: 'banned-user-1',
        email: testUser.email,
        passwordHash,
        role: 'CUSTOMER',
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(401);

      // TASK-274: login answers every rejection with the same generic message —
      // a distinct "Account is deactivated" reply would confirm the account exists.
      expect(response.body.message).toBe('Invalid credentials');
      // A banned user must never be issued tokens.
      expect(authRepositoryMock.saveRefreshToken).not.toHaveBeenCalled();
    });

    it("should return 401 when refreshing with a deactivated user's token", async () => {
      // Mint a validly-signed refresh JWT directly (no register call — that
      // would consume the register @Throttle budget and is unnecessary here).
      const refreshJwt = jwtService.sign(
        { sub: 'user-e2e-1', role: 'CUSTOMER', type: 'refresh' },
        { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' },
      );

      // The token is valid and unexpired, but its owner is now deactivated.
      authRepositoryMock.findRefreshToken.mockResolvedValue({
        id: 'rt-e2e-1',
        token: 'hashed',
        userId: 'user-e2e-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        createdAt: new Date(),
        user: {
          id: 'user-e2e-1',
          email: testUser.email,
          passwordHash: 'hash',
          firstName: null,
          lastName: null,
          phone: null,
          role: 'CUSTOMER',
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${refreshJwt}`)
        .expect(401);

      expect(response.body.message).toBe('Account is deactivated');
    });
  });

  // ─── Logout ─────────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('should return 401 when accessing logout without a token', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    });

    it('should logout and return 200 with valid token', async () => {
      authRepositoryMock.findByEmail.mockResolvedValue(null);
      authRepositoryMock.createUser.mockImplementation(async (data: Record<string, unknown>) => ({
        id: 'user-e2e-1',
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        role: 'CUSTOMER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      authRepositoryMock.saveRefreshToken.mockImplementation(
        async (userId: string, token: string) => ({
          id: 'rt-e2e-1',
          token,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          isRevoked: false,
          createdAt: new Date(),
        }),
      );
      authRepositoryMock.revokeAllUserTokens.mockResolvedValue(undefined);

      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      const accessToken = registerResponse.body.data.accessToken;

      const logoutResponse = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(logoutResponse.body).toHaveProperty('data');
      expect(logoutResponse.body.data).toHaveProperty('message');
      expect(logoutResponse.body.data.message).toBe('Logged out');

      // Should clear the refresh cookie
      const setCookieHeader = logoutResponse.headers['set-cookie'];
      if (setCookieHeader) {
        const cookieStr = Array.isArray(setCookieHeader)
          ? setCookieHeader.join(';')
          : setCookieHeader;
        expect(cookieStr).toContain('Max-Age=0');
      }
    });
  });

  // ─── Password reset — request (existence-hiding) ─────────────────────────────

  describe('POST /api/auth/password-reset/request', () => {
    const activeUser = {
      id: 'user-e2e-1',
      email: testUser.email,
      passwordHash: 'hash',
      firstName: null,
      lastName: null,
      phone: null,
      role: 'CUSTOMER',
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns 200 with a generic message for an existing active user', async () => {
      authRepositoryMock.findByEmail.mockResolvedValue(activeUser);
      authRepositoryMock.savePasswordResetToken.mockResolvedValue({ id: 'prt-1' });
      authRepositoryMock.invalidateActivePasswordResetTokens.mockResolvedValue(undefined);

      const response = await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email: testUser.email })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('message');
      expect(typeof response.body.data.message).toBe('string');
    });

    it('returns a byte-identical body for a non-existent email (existence-hiding)', async () => {
      // First: existing active user.
      authRepositoryMock.findByEmail.mockResolvedValue(activeUser);
      authRepositoryMock.savePasswordResetToken.mockResolvedValue({ id: 'prt-1' });
      authRepositoryMock.invalidateActivePasswordResetTokens.mockResolvedValue(undefined);
      const existing = await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email: testUser.email })
        .expect(200);

      // Then: unknown email — no user found. Clear the token-save call history so
      // the assertion below observes only the no-account request.
      authRepositoryMock.findByEmail.mockResolvedValue(null);
      authRepositoryMock.savePasswordResetToken.mockClear();
      const missing = await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      // The response body must be identical so it cannot be used to enumerate accounts.
      expect(missing.body).toEqual(existing.body);
      // And the no-account path must never issue a token.
      expect(authRepositoryMock.savePasswordResetToken).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/request')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  // ─── Password reset — confirm (single-use, generic errors) ───────────────────

  describe('POST /api/auth/password-reset/confirm', () => {
    it('returns 401 for an unknown token', async () => {
      authRepositoryMock.findPasswordResetToken.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token: 'unknown-token', newPassword: 'NewStrongP@ss123' })
        .expect(401);
    });

    it('returns 400 for a weak new password (policy enforced)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token: 'some-token', newPassword: 'weak' })
        .expect(400);
    });

    it('returns 200 and revokes all sessions on a valid confirm', async () => {
      authRepositoryMock.findPasswordResetToken.mockResolvedValue({
        id: 'prt-1',
        token: 'hashed',
        userId: 'user-e2e-1',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null,
        createdAt: new Date(),
        user: {
          id: 'user-e2e-1',
          email: testUser.email,
          passwordHash: 'old-hash',
          isActive: true,
          deletedAt: null,
        },
      });
      authRepositoryMock.updatePasswordHash.mockResolvedValue(undefined);
      authRepositoryMock.markPasswordResetTokenUsed.mockResolvedValue(undefined);
      authRepositoryMock.revokeAllUserTokens.mockResolvedValue(undefined);

      const response = await request(app.getHttpServer())
        .post('/api/auth/password-reset/confirm')
        .send({ token: 'valid-token', newPassword: 'NewStrongP@ss123' })
        .expect(200);

      expect(response.body.data).toHaveProperty('message');
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('user-e2e-1');
    });
  });

  // ─── Protected endpoints ────────────────────────────────────────────────────

  describe('Protected endpoints', () => {
    it('should return 401 when accessing a protected endpoint without a token', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    });

    it('should return 200 when accessing a protected endpoint with a valid token', async () => {
      authRepositoryMock.findByEmail.mockResolvedValue(null);
      authRepositoryMock.createUser.mockImplementation(async (data: Record<string, unknown>) => ({
        id: 'user-e2e-1',
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        role: 'CUSTOMER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      authRepositoryMock.saveRefreshToken.mockImplementation(
        async (userId: string, token: string) => ({
          id: 'rt-e2e-1',
          token,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          isRevoked: false,
          createdAt: new Date(),
        }),
      );
      authRepositoryMock.revokeAllUserTokens.mockResolvedValue(undefined);

      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      const accessToken = registerResponse.body.data.accessToken;

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  // ─── Google OAuth (TASK-168) ────────────────────────────────────────────────

  describe('Google OAuth (TASK-168)', () => {
    // Mirrors the callback handler's
    // `configService.get('STORE_CLIENT_URL', 'http://localhost:3000')`.
    const clientUrl = (): string => process.env.STORE_CLIENT_URL ?? 'http://localhost:3000';

    const getSetCookies = (headers: Record<string, unknown>): string[] => {
      const raw = headers['set-cookie'];
      if (!raw) {
        return [];
      }
      return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
    };

    const googleUser = {
      id: 'user-google-1',
      email: 'google-user@example.com',
      passwordHash: null,
      firstName: 'Google',
      lastName: 'User',
      phone: null,
      role: 'CUSTOMER',
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const googleProfile: GoogleOAuthProfile = {
      providerId: 'google-sub-e2e-1',
      email: googleUser.email,
      emailVerified: true,
      firstName: 'Google',
      lastName: 'User',
      redirect: '/',
    };

    const oauthLinkFor = <T extends { id: string; email: string }>(user: T) => ({
      id: 'oauth-e2e-1',
      provider: 'GOOGLE',
      providerId: googleProfile.providerId,
      userId: user.id,
      email: user.email,
      createdAt: new Date(),
      user,
    });

    afterEach(() => {
      GoogleAuthGuardTestDouble.reset();
    });

    it('returns 503 when GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are unset', async () => {
      // The test double is unarmed here, so the REAL GoogleAuthGuard runs; the
      // suite pinned both vars to '' before boot (top of file), so the module
      // booted with zero Google config — and still serves every other route.
      const response = await request(app.getHttpServer()).get('/api/auth/google').expect(503);

      expect(response.body.message).toBe('Google sign-in is not configured');

      // The config-presence gate covers both legs identically.
      await request(app.getHttpServer()).get('/api/auth/google/callback').expect(503);
    });

    it('redirects an authenticated Google profile back to the storefront with the refresh cookie and no token in any URL', async () => {
      GoogleAuthGuardTestDouble.inject({ ...googleProfile, redirect: '/checkout' });

      authRepositoryMock.findOAuthAccount.mockResolvedValue(oauthLinkFor(googleUser));
      authRepositoryMock.saveRefreshToken.mockImplementation(
        async (userId: string, token: string) => ({
          id: 'rt-google-1',
          token,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          isRevoked: false,
          createdAt: new Date(),
        }),
      );

      const response = await request(app.getHttpServer())
        .get('/api/auth/google/callback')
        .expect(302);

      // Lands on the state-carried same-origin target with NO token anywhere
      // in the URL — no query string at all; the session travels only in the
      // HttpOnly refresh cookie (bootstrap-refresh picks it up client-side).
      const location = response.headers.location;
      expect(location).toBe(`${clientUrl()}/checkout`);
      expect(location).not.toContain('?');
      expect(location.toLowerCase()).not.toContain('token');

      const refreshCookie = getSetCookies(response.headers).find((cookie) =>
        cookie.startsWith('refreshToken='),
      );
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('Path=/api/auth/refresh');

      const refreshValue = refreshCookie?.match(/^refreshToken=([^;]+)/)?.[1] ?? '';
      expect(refreshValue.length).toBeGreaterThan(0);
      expect(location).not.toContain(refreshValue);

      // Fast path: resolved by (provider, providerId) — no email lookup, no re-link.
      expect(authRepositoryMock.findByEmail).not.toHaveBeenCalled();
      expect(authRepositoryMock.linkOAuthAccount).not.toHaveBeenCalled();
    });

    it('redirects a deactivated linked user to the generic failure target with no session and no oracle', async () => {
      GoogleAuthGuardTestDouble.inject(googleProfile);

      authRepositoryMock.findOAuthAccount.mockResolvedValue(
        oauthLinkFor({ ...googleUser, isActive: false }),
      );

      const response = await request(app.getHttpServer())
        .get('/api/auth/google/callback')
        .expect(302);

      // Same fixed target as every other OAuth failure — no reason code, no
      // account-state oracle (TASK-274 generic-refusal policy).
      expect(response.headers.location).toBe(`${clientUrl()}/login?oauthError=1`);

      expect(
        getSetCookies(response.headers).some((cookie) => cookie.startsWith('refreshToken=')),
      ).toBe(false);
      expect(authRepositoryMock.saveRefreshToken).not.toHaveBeenCalled();

      // The one party who may learn about the lock is the account owner, by
      // email (TASK-287 notice through the mail outbox).
      expect(prismaServiceMock.mailOutbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recipient: googleUser.email }),
        }),
      );
    });

    it('redirects a tombstoned email-matched user to the same generic failure target and never links', async () => {
      GoogleAuthGuardTestDouble.inject(googleProfile);

      authRepositoryMock.findOAuthAccount.mockResolvedValue(null);
      authRepositoryMock.findByEmail.mockResolvedValue({
        ...googleUser,
        passwordHash: 'hash',
        deletedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .get('/api/auth/google/callback')
        .expect(302);

      expect(response.headers.location).toBe(`${clientUrl()}/login?oauthError=1`);
      expect(
        getSetCookies(response.headers).some((cookie) => cookie.startsWith('refreshToken=')),
      ).toBe(false);
      // A locked account must never accumulate a working OAuth link — no
      // silent-reactivation side channel (plan 153 §Locked-account resolution).
      expect(authRepositoryMock.linkOAuthAccount).not.toHaveBeenCalled();
      expect(authRepositoryMock.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('redirects to the generic oauthError path when the callback carries no profile', async () => {
      // Google-side denial/cancel or bad/expired state: the guard leaves
      // req.user undefined and the handler — not the guard — decides.
      GoogleAuthGuardTestDouble.inject(undefined);

      const response = await request(app.getHttpServer())
        .get('/api/auth/google/callback')
        .expect(302);

      expect(response.headers.location).toBe(`${clientUrl()}/login?oauthError=1`);
      expect(
        getSetCookies(response.headers).some((cookie) => cookie.startsWith('refreshToken=')),
      ).toBe(false);
      // Nothing was resolved — the repository is never touched on this branch.
      expect(authRepositoryMock.findOAuthAccount).not.toHaveBeenCalled();
      expect(authRepositoryMock.findByEmail).not.toHaveBeenCalled();
    });
  });
});
