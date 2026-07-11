import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { PrismaService } from '../src/prisma';
import * as argon2 from 'argon2';

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
});
