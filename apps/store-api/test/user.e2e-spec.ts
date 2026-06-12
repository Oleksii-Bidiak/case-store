import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the User module.
 *
 * Uses mocked AuthRepository, UserRepository, and PrismaService
 * to avoid requiring a real database connection. JWT tokens are
 * generated directly via JwtService to bypass the rate-limited
 * auth register endpoint.
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

describe('UserController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Mock AuthRepository — for JWT strategy user lookup
  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  // Mock UserRepository — for user management endpoints
  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
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
  };

  // Test data
  const testUser = {
    id: 'user-e2e-1',
    email: 'e2e-user@example.com',
    passwordHash: '$argon2id$hash',
    firstName: 'E2E',
    lastName: 'Tester',
    phone: '+380991234567',
    role: 'CUSTOMER' as const,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const testAdmin = {
    id: 'admin-e2e-1',
    email: 'e2e-admin@example.com',
    passwordHash: '$argon2id$hash',
    firstName: 'Admin',
    lastName: 'User',
    phone: null,
    role: 'ADMIN' as const,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  /**
   * Generate a JWT access token for a given user ID and role.
   * Bypasses the rate-limited auth register endpoint.
   */
  function generateAccessToken(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      },
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env'],
        }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

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

  // ─── GET /api/users/me ──────────────────────────────────────────────────────

  describe('GET /api/users/me', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/users/me').expect(401);
    });

    it('should return 200 with user profile for authenticated user', async () => {
      const token = generateAccessToken(testUser.id, testUser.role);

      userRepositoryMock.findById.mockResolvedValue(testUser);

      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('firstName');
      expect(response.body.data).toHaveProperty('lastName');
      expect(response.body.data).toHaveProperty('role');
      expect(response.body.data).toHaveProperty('isActive');
      // Sensitive fields must NOT be present
      expect(response.body.data).not.toHaveProperty('passwordHash');
      expect(response.body.data).not.toHaveProperty('refreshTokens');
    });

    it('should return 404 when user is not found', async () => {
      const token = generateAccessToken('nonexistent-id', 'CUSTOMER');

      userRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── PUT /api/users/me ──────────────────────────────────────────────────────

  describe('PUT /api/users/me', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .put('/api/users/me')
        .send({ firstName: 'New' })
        .expect(401);
    });

    it('should update profile and return updated user', async () => {
      const token = generateAccessToken(testUser.id, testUser.role);

      userRepositoryMock.findById.mockResolvedValue(testUser);
      userRepositoryMock.update.mockResolvedValue({
        ...testUser,
        firstName: 'New',
        updatedAt: new Date('2026-05-05T12:00:00.000Z'),
      });

      const response = await request(app.getHttpServer())
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'New' })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.firstName).toBe('New');
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });

    it('should return 409 when updating email to one already taken', async () => {
      const token = generateAccessToken(testUser.id, testUser.role);

      userRepositoryMock.findById.mockResolvedValue(testUser);
      userRepositoryMock.findByEmail.mockResolvedValue({
        ...testUser,
        id: 'other-user-id',
        email: 'taken@example.com',
      });

      await request(app.getHttpServer())
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'taken@example.com' })
        .expect(409);
    });

    it('should return 400 when sending invalid data', async () => {
      const token = generateAccessToken(testUser.id, testUser.role);

      await request(app.getHttpServer())
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  // ─── GET /api/users (admin) ─────────────────────────────────────────────────

  describe('GET /api/users', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/users').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testUser.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with paginated user list for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findAll.mockResolvedValue({
        users: [testUser, testAdmin],
        total: 2,
      });

      const response = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('limit');
      expect(response.body.meta).toHaveProperty('totalPages');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should pass the search filter to the repository and return matching users', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findAll.mockResolvedValue({
        users: [testUser],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/users?search=e2e-user')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(userRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'e2e-user' }),
      );
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].email).toBe(testUser.email);
    });

    it('should filter by role=CUSTOMER and return only customers', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findAll.mockResolvedValue({
        users: [testUser],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/users?role=CUSTOMER')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(userRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'CUSTOMER' }),
      );
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].role).toBe('CUSTOMER');
    });
  });

  // ─── GET /api/users/:id (admin) ─────────────────────────────────────────────

  describe('GET /api/users/:id', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/users/some-id').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testUser.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/users/some-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with user details for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findById.mockResolvedValue({
        ...testUser,
        id: 'user-detail-id',
        email: 'detail@example.com',
      });

      const response = await request(app.getHttpServer())
        .get('/api/users/user-detail-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });

    it('should return 404 for non-existent user', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/users/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── PATCH /api/users/:id/deactivate (admin) ────────────────────────────────

  describe('PATCH /api/users/:id/deactivate', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).patch('/api/users/some-id/deactivate').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testUser.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/users/some-id/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should deactivate user and return updated user for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findById.mockResolvedValue({
        ...testUser,
        id: 'user-to-deactivate',
        isActive: true,
      });
      userRepositoryMock.deactivate.mockResolvedValue({
        ...testUser,
        id: 'user-to-deactivate',
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/users/user-to-deactivate/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.isActive).toBe(false);
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });

    it('should return 404 when deactivating non-existent user', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/users/nonexistent-id/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── PATCH /api/users/:id/activate (admin) ──────────────────────────────────

  describe('PATCH /api/users/:id/activate', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).patch('/api/users/some-id/activate').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testUser.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/users/some-id/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should activate user and return updated user for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findById.mockResolvedValue({
        ...testUser,
        id: 'user-to-activate',
        isActive: false,
      });
      userRepositoryMock.activate.mockResolvedValue({
        ...testUser,
        id: 'user-to-activate',
        isActive: true,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/users/user-to-activate/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.isActive).toBe(true);
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });

    it('should return 404 when activating non-existent user', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/users/nonexistent-id/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
