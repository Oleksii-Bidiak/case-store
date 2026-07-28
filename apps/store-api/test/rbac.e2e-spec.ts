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
import { CartRepository } from '../src/cart/cart.repository';
import { OrderRepository } from '../src/order/order.repository';
import { ProductService } from '../src/product/product.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma';
import { OrderService } from '../src/order/order.service';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * RBAC guard-behaviour e2e tests.
 *
 * Verifies the 401-vs-403 contract on admin-only endpoints end to end, through
 * the real guard (JwtAuthGuard + PermissionGuard):
 *   - no JWT              → 401 (authentication missing)
 *   - CUSTOMER JWT        → 403 (authenticated, wrong role)
 *   - ADMIN JWT           → guard passes (reaches the mocked service)
 *   - MANAGER JWT         → passes only what the matrix grants (TASK-334)
 *
 * The bootstrap mirrors order.e2e-spec.ts: real AppModule, repositories mocked
 * so no DB is needed, JWTs minted directly via JwtService, and the global
 * ThrottlerGuard replaced with a pass-through so rate limiting never interferes.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('RBAC guards (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const customer = { id: 'cust-rbac-1', role: 'CUSTOMER' as const };
  const admin = { id: 'admin-rbac-1', role: 'ADMIN' as const };
  const manager = { id: 'manager-rbac-1', role: 'MANAGER' as const };

  // The matrix as seeded for this suite: the manager may edit the catalogue and
  // nothing else. Stateful — PUT /api/admin/permissions really rewrites it.
  const permissionRepositoryMock = createPermissionRepositoryMock({
    grants: { MANAGER: ['products:read', 'products:write'] },
  });

  const validProduct = {
    name: 'RBAC Test Product',
    price: 29.99,
    categoryId: '550e8400-e29b-41d4-a716-446655440000',
  };

  // ProductService is mocked so the ADMIN create path returns without a DB.
  const productServiceMock = {
    create: jest.fn().mockResolvedValue({ id: 'prod-rbac-1', ...validProduct }),
    update: jest.fn().mockResolvedValue({ id: 'prod-rbac-1', ...validProduct, price: 19.99 }),
    adminFindAll: jest
      .fn()
      .mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }),
  };

  // The admin order list is the PII surface this suite guards: it carries
  // customer emails, phones and delivery addresses.
  const orderServiceMock = {
    adminGetAllOrders: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'order-rbac-1',
          customerEmail: 'shopper@example.com',
          customerPhone: '+380991234567',
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    }),
  };

  // OrderRepository is mocked so AppModule wires up without a real database.
  const orderRepositoryMock = {
    createFromCart: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    cancelAndRestock: jest.fn(),
    updatePaymentStatus: jest.fn(),
  };

  // Boot-time mocks so AppModule wires up without a real database.
  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };
  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };
  const cartRepositoryMock = { findByUserId: jest.fn() };
  const mailServiceMock = { sendOrderConfirmation: jest.fn().mockResolvedValue(undefined) };
  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  function token(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
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
      .overrideProvider(CartRepository)
      .useValue(cartRepositoryMock)
      .overrideProvider(OrderRepository)
      .useValue(orderRepositoryMock)
      .overrideProvider(ProductService)
      .useValue(productServiceMock)
      .overrideProvider(OrderService)
      .useValue(orderServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(permissionRepositoryMock)
      .overrideProvider(MailService)
      .useValue(mailServiceMock)
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
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── POST /api/products (AdminGuard) ────────────────────────────────────────

  describe('POST /api/products', () => {
    it('returns 401 without a JWT (authentication required)', async () => {
      await request(app.getHttpServer()).post('/api/products').send(validProduct).expect(401);
      expect(productServiceMock.create).not.toHaveBeenCalled();
    });

    it('returns 403 for an authenticated CUSTOMER (wrong role)', async () => {
      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token(customer.id, customer.role)}`)
        .send(validProduct)
        .expect(403);
      expect(productServiceMock.create).not.toHaveBeenCalled();
    });

    it('passes the guard for an authenticated ADMIN (201)', async () => {
      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token(admin.id, admin.role)}`)
        .send(validProduct)
        .expect(201);
      expect(productServiceMock.create).toHaveBeenCalledTimes(1);
    });
  });

  // ─── MANAGER and the permission matrix (TASK-334) ───────────────────────────

  describe('MANAGER — the permission matrix', () => {
    const managerAuth = () => `Bearer ${token(manager.id, manager.role)}`;

    it('reaches a route the matrix grants (products:write)', async () => {
      await request(app.getHttpServer())
        .put('/api/products/prod-rbac-1')
        .set('Authorization', managerAuth())
        .send({ price: 19.99 })
        .expect(200);

      expect(productServiceMock.update).toHaveBeenCalledTimes(1);
    });

    it('is refused on /admin/orders — a permission with no row is DENIED, not unknown', async () => {
      // `orders:read` exists in the code catalogue but this manager holds no row
      // for it. Absence must mean denied: the opposite default would hand every
      // future admin section to every existing manager on the day it ships.
      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .set('Authorization', managerAuth())
        .expect(403);

      expect(orderServiceMock.adminGetAllOrders).not.toHaveBeenCalled();
    });

    it('leaks no customer PII on any endpoint it is refused', async () => {
      const piiEndpoints = [
        '/api/admin/orders',
        '/api/admin/orders/order-rbac-1',
        '/api/users',
        '/api/users/cust-rbac-1',
        '/api/users/cust-rbac-1/admin-card',
        '/api/admin/dashboard/summary',
      ];

      for (const url of piiEndpoints) {
        const response = await request(app.getHttpServer())
          .get(url)
          .set('Authorization', managerAuth());

        expect(response.status).toBe(403);

        // Not merely "was refused" — the refusal body itself must not carry the
        // data. A 403 that still serialises the record is exactly the failure
        // this assertion exists for.
        const body = JSON.stringify(response.body);
        expect(body).not.toContain('shopper@example.com');
        expect(body).not.toContain('+380991234567');
        expect(body).not.toContain('customerEmail');
      }
    });

    it('is refused every owner-only route (user management cannot be granted)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/permissions')
        .set('Authorization', managerAuth())
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', managerAuth())
        .send({ email: 'x@example.com', password: 'StrongP@ss123', role: 'ADMIN' })
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/admin/audit-log')
        .set('Authorization', managerAuth())
        .expect(403);
    });

    it('loses a revoked permission on the NEXT request, not when the token expires', async () => {
      // Baseline: the grant is live.
      await request(app.getHttpServer())
        .put('/api/products/prod-rbac-1')
        .set('Authorization', managerAuth())
        .send({ price: 19.99 })
        .expect(200);

      // The owner revokes it through the real endpoint, so the real cache
      // eviction runs. The manager's access token is untouched and still says
      // MANAGER for another 15 minutes.
      await request(app.getHttpServer())
        .put('/api/admin/permissions')
        .set('Authorization', `Bearer ${token(admin.id, admin.role)}`)
        .send({ role: 'MANAGER', permissions: ['products:read'] })
        .expect(200);

      productServiceMock.update.mockClear();

      await request(app.getHttpServer())
        .put('/api/products/prod-rbac-1')
        .set('Authorization', managerAuth())
        .send({ price: 24.99 })
        .expect(403);

      expect(productServiceMock.update).not.toHaveBeenCalled();

      // …while a permission that was NOT revoked still works, proving the
      // refusal above is the revocation and not a blanket lockout.
      await request(app.getHttpServer())
        .get('/api/products/admin/list')
        .set('Authorization', managerAuth())
        .expect(200);
    });

    it('never lets the matrix express an ADMIN row (the owner cannot be locked out)', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/permissions')
        .set('Authorization', `Bearer ${token(admin.id, admin.role)}`)
        .send({ role: 'ADMIN', permissions: [] })
        .expect(400);
    });

    it('rejects a permission key that does not exist in the code catalogue', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/permissions')
        .set('Authorization', `Bearer ${token(admin.id, admin.role)}`)
        .send({ role: 'MANAGER', permissions: ['products:writ'] })
        .expect(400);
    });
  });

  // ─── The account state behind the token (edge case E-06) ────────────────────

  describe('a token that outlived its account', () => {
    it('is refused, because the role is resolved from the database and not the JWT', async () => {
      // Exactly the dismissed-employee case: the access token is valid,
      // unexpired and says ADMIN. The row behind it is gone.
      jest.spyOn(permissionRepositoryMock, 'findActor').mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token(admin.id, admin.role)}`)
        .send(validProduct)
        .expect(403);

      expect(productServiceMock.create).not.toHaveBeenCalled();
    });
  });

  // ─── GET /api/auth/me/permissions (the frontend's source of truth) ──────────

  describe('GET /api/auth/me/permissions', () => {
    it('reports the owner as holding the entire catalogue', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me/permissions')
        .set('Authorization', `Bearer ${token(admin.id, admin.role)}`)
        .expect(200);

      expect(response.body.data.isOwner).toBe(true);
      expect(response.body.data.permissions).toContain('orders:read');
      expect(response.body.data.permissions).toContain('products:write');
    });

    it('reports a customer as holding nothing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me/permissions')
        .set('Authorization', `Bearer ${token(customer.id, customer.role)}`)
        .expect(200);

      expect(response.body.data).toEqual({
        role: 'CUSTOMER',
        isOwner: false,
        permissions: [],
      });
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/auth/me/permissions').expect(401);
    });
  });
});
