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
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

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

  // Mock UserRepository — for the customer-management endpoints.
  //
  // Two lookups since TASK-476, and which one a route uses is the contract:
  // `findById` serves `/api/users/me` (staff read their own profile there too),
  // `findCustomerById` serves every ADMIN-facing route, so a service account
  // simply does not resolve through this controller any more.
  const userRepositoryMock = {
    findById: jest.fn(),
    findCustomerById: jest.fn(),
    findByEmail: jest.fn(),
    softDelete: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
    // Admin customer card enrichment reads (TASK-252).
    getLtv: jest.fn(),
    getOrderCount: jest.fn(),
    getRecentOrders: jest.fn(),
    getReviewsByUserId: jest.fn(),
    getRedeemedCoupons: jest.fn(),
    getContactMessagesByEmail: jest.fn(),
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
    // TASK-589: banning an account now withdraws its reviews and ratings, so the
    // ban path reaches ReviewRepository — which is real here, unlike in
    // review.e2e-spec.ts.
    review: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

  // Hoisted out of the `.overrideProvider(...)` call so the customer-card suite
  // below can vary one caller's rights with `jest.spyOn` — the pattern the shared
  // double documents, and the only way to say "this manager holds exactly these
  // two keys" without standing up a second Nest application.
  const permissionRepositoryMock = createPermissionRepositoryMock();

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
      .overrideProvider(PermissionRepository)
      .useValue(permissionRepositoryMock)
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

    it('should return 400 when trying to change the email address (TASK-372)', async () => {
      const token = generateAccessToken(testUser.id, testUser.role);

      userRepositoryMock.findById.mockResolvedValue(testUser);

      // Taken or free, the answer is the same 400 — the address is the login and
      // the password-reset channel, so it does not change through a profile edit.
      // Identical answers also deny an enumeration oracle.
      await request(app.getHttpServer())
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'taken@example.com' })
        .expect(400);

      await request(app.getHttpServer())
        .put('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'brand-new@example.com' })
        .expect(400);

      expect(userRepositoryMock.update).not.toHaveBeenCalled();
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

      userRepositoryMock.findCustomerById.mockResolvedValue({
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

      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/users/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── GET /api/users/:id/admin-card (admin, TASK-252) ────────────────────────

  describe('GET /api/users/:id/admin-card', () => {
    function stubCardReads() {
      userRepositoryMock.getLtv.mockResolvedValue(1299.5);
      userRepositoryMock.getOrderCount.mockResolvedValue(12);
      userRepositoryMock.getRecentOrders.mockResolvedValue([
        {
          id: 'order-1',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          total: 129.99,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      userRepositoryMock.getReviewsByUserId.mockResolvedValue([
        {
          id: 'review-1',
          productId: 'prod-1',
          productName: 'iPhone 15 Pro Case',
          rating: 5,
          comment: 'Great!',
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      userRepositoryMock.getRedeemedCoupons.mockResolvedValue([
        {
          id: 'redemption-1',
          code: 'SUMMER20',
          type: 'PERCENT',
          value: 20,
          orderId: 'order-1',
          redeemedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      userRepositoryMock.getContactMessagesByEmail.mockResolvedValue([
        {
          id: 'message-1',
          name: 'John',
          phone: '+380991234567',
          email: 'detail@example.com',
          topic: 'Order question',
          orderRef: null,
          message: 'When will my order ship?',
          status: 'NEW',
          adminNote: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
    }

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/users/some-id/admin-card').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testUser.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/users/some-id/admin-card')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with a fully-shaped customer card for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findCustomerById.mockResolvedValue({
        ...testUser,
        id: 'user-detail-id',
        email: 'detail@example.com',
      });
      stubCardReads();

      const response = await request(app.getHttpServer())
        .get('/api/users/user-detail-id/admin-card')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const card = response.body.data;
      expect(card).toHaveProperty('user');
      expect(card.user).toHaveProperty('id', 'user-detail-id');
      expect(card.user).not.toHaveProperty('passwordHash');
      expect(typeof card.ltv).toBe('number');
      expect(card.ltv).toBe(1299.5);
      expect(typeof card.orderCount).toBe('number');
      expect(Array.isArray(card.recentOrders)).toBe(true);
      expect(Array.isArray(card.reviews)).toBe(true);
      expect(Array.isArray(card.redeemedCoupons)).toBe(true);
      expect(Array.isArray(card.contactMessages)).toBe(true);
      expect(card.recentOrders[0].total).toBe(129.99);
      expect(card.contactMessages[0]).toEqual(
        expect.objectContaining({ id: 'message-1', status: 'NEW' }),
      );
      // The email-matched read uses the resolved user's email.
      expect(userRepositoryMock.getContactMessagesByEmail).toHaveBeenCalledWith(
        'detail@example.com',
        20,
      );
    });

    it('should return 404 when the user is not found', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/users/nonexistent-id/admin-card')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── The customer-card split (TASK-479, plan 181, invariant 7) ──────────────

  /**
   * An order operator holds `customers:read` so they can find a customer and
   * phone them back. Until this task that same key also opened the full card:
   * lifetime value, every order with its total, the text of every review, every
   * redeemed coupon and the full text of every support message. Those are two
   * different jobs, and only one of them is "return a call".
   *
   * These cases are the HTTP half of the split — the unit spec beside the
   * controller pins the decorators, this one proves the guard actually refuses,
   * and that what the operator kept still answers 200.
   */
  describe('customers:read without customers:card', () => {
    const MANAGER_ID = 'manager-e2e-card-1';

    /** Give the next request's caller exactly `permissions` and nothing else. */
    function managerHolding(...permissions: string[]): string {
      jest.spyOn(permissionRepositoryMock, 'findActor').mockResolvedValue({
        id: MANAGER_ID,
        email: 'operator@test.local',
        role: 'MANAGER' as never,
        isOwner: false,
        permissions: new Set(permissions),
      });
      return `Bearer ${generateAccessToken(MANAGER_ID, 'MANAGER')}`;
    }

    afterEach(() => {
      // `jest.clearAllMocks()` clears CALLS, not implementations — a spy left
      // standing would hand the next describe a manager instead of an admin.
      jest.restoreAllMocks();
    });

    it('refuses the full card with 403, and reads nothing on the way out', async () => {
      const auth = managerHolding('customers:read');

      await request(app.getHttpServer())
        .get('/api/users/user-detail-id/admin-card')
        .set('Authorization', auth)
        .expect(403);

      // The guard refuses BEFORE the service, so not one of the six enrichment
      // reads runs. A 403 assembled after the data was fetched would still be a
      // 403 — and would still have put the whole card in a log line.
      expect(userRepositoryMock.getLtv).not.toHaveBeenCalled();
      expect(userRepositoryMock.getRecentOrders).not.toHaveBeenCalled();
      expect(userRepositoryMock.getReviewsByUserId).not.toHaveBeenCalled();
      expect(userRepositoryMock.getRedeemedCoupons).not.toHaveBeenCalled();
      expect(userRepositoryMock.getContactMessagesByEmail).not.toHaveBeenCalled();
    });

    it('still lists customers and still reads their contact details', async () => {
      // The half of `customers:read` that survives, and the reason the split is
      // shippable at all: an operator who could phone a customer yesterday can
      // still phone them today.
      const auth = managerHolding('customers:read');

      userRepositoryMock.findAll.mockResolvedValue({ users: [testUser], total: 1 });
      userRepositoryMock.findCustomerById.mockResolvedValue(testUser);

      const list = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', auth)
        .expect(200);
      expect(list.body.data).toHaveLength(1);

      const one = await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(one.body.data.phone).toBe(testUser.phone);
      expect(one.body.data.email).toBe(testUser.email);
    });

    it('opens the card once customers:card is added', async () => {
      const auth = managerHolding('customers:read', 'customers:card');

      userRepositoryMock.findCustomerById.mockResolvedValue(testUser);
      userRepositoryMock.getLtv.mockResolvedValue(1299.5);
      userRepositoryMock.getOrderCount.mockResolvedValue(12);
      userRepositoryMock.getRecentOrders.mockResolvedValue([]);
      userRepositoryMock.getReviewsByUserId.mockResolvedValue([]);
      userRepositoryMock.getRedeemedCoupons.mockResolvedValue([]);
      userRepositoryMock.getContactMessagesByEmail.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}/admin-card`)
        .set('Authorization', auth)
        .expect(200);

      expect(response.body.data.ltv).toBe(1299.5);
    });

    it('stands on its own: customers:card alone opens the card and still cannot enumerate', async () => {
      // A deliberate decision, not an accident of using a single-key decorator.
      // A permission whose enforcement silently depends on a SECOND tick is the
      // failure the catalogue's `stock:write` note warns about: the owner ticks
      // the box, nothing happens, and no screen says why. So the key is
      // self-sufficient — and it is not a hole, because the card already
      // contains the contact details `customers:read` would have bought. What it
      // does NOT buy is enumeration: without `customers:read` there is no list
      // to pick an id out of.
      const auth = managerHolding('customers:card');

      userRepositoryMock.findCustomerById.mockResolvedValue(testUser);
      userRepositoryMock.getLtv.mockResolvedValue(0);
      userRepositoryMock.getOrderCount.mockResolvedValue(0);
      userRepositoryMock.getRecentOrders.mockResolvedValue([]);
      userRepositoryMock.getReviewsByUserId.mockResolvedValue([]);
      userRepositoryMock.getRedeemedCoupons.mockResolvedValue([]);
      userRepositoryMock.getContactMessagesByEmail.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`/api/users/${testUser.id}/admin-card`)
        .set('Authorization', auth)
        .expect(200);

      await request(app.getHttpServer()).get('/api/users').set('Authorization', auth).expect(403);
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

      userRepositoryMock.findCustomerById.mockResolvedValue({
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

      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/users/nonexistent-id/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 403 when an admin tries to deactivate their own account', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      const response = await request(app.getHttpServer())
        .patch(`/api/users/${testAdmin.id}/deactivate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.message).toBe('Cannot deactivate your own account');
      // Self-ban is rejected before any repository work.
      expect(userRepositoryMock.deactivate).not.toHaveBeenCalled();
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

      userRepositoryMock.findCustomerById.mockResolvedValue({
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

      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/users/nonexistent-id/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── The customer scope of this controller (TASK-476) ───────────────────────

  describe('what this controller is NOT any more', () => {
    it('has no create / password / role routes left — they answer 404 from the router', async () => {
      // Moved to `/api/admin/staff`. 404 rather than 403 is the honest signal: an
      // old client is not "not allowed", it is calling something that is gone.
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'x@example.com', password: 'StrongP@ss123', role: 'MANAGER' })
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/users/some-id/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'StrongP@ss123' })
        .expect(404);

      await request(app.getHttpServer())
        .patch('/api/users/some-id/role')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'MANAGER' })
        .expect(404);
    });

    it('reads every admin-facing route through the CUSTOMER-scoped lookup', async () => {
      // The property that lets this controller stay under `customers:read` /
      // `customers:write`: `findById` (which would resolve a service account) is
      // reserved for `/api/users/me`.
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      userRepositoryMock.findCustomerById.mockResolvedValue(null);

      for (const [method, url] of [
        ['get', '/api/users/staff-id'],
        ['get', '/api/users/staff-id/admin-card'],
        ['patch', '/api/users/staff-id/deactivate'],
        ['patch', '/api/users/staff-id/activate'],
      ] as const) {
        await request(app.getHttpServer())
          [method](url)
          .set('Authorization', `Bearer ${token}`)
          .expect(404);
      }

      expect(userRepositoryMock.findById).not.toHaveBeenCalled();
      expect(userRepositoryMock.findCustomerById).toHaveBeenCalledTimes(4);
      expect(userRepositoryMock.deactivate).not.toHaveBeenCalled();
      expect(userRepositoryMock.activate).not.toHaveBeenCalled();
    });
  });
});
