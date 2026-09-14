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
 * Verifies the 401-vs-403 contract on admin endpoints end to end, through the
 * real guard (JwtAuthGuard + PermissionGuard), across all four levels the access
 * model defines (TASK-475, plan 181):
 *   - no JWT        → 401 (authentication missing)
 *   - CUSTOMER JWT  → 403 (authenticated, no rights at all)
 *   - MANAGER JWT   → passes exactly the permissions granted to that PERSON
 *   - ADMIN JWT     → passes every permission, and no `@OwnerOnly` route
 *   - OWNER JWT     → passes everything, reserve included
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
  // A deputy: ADMIN by role, but not the account that owns the shop. The level
  // this whole task exists to make real — and the only caller for whom "passes
  // every permission" and "passes @OwnerOnly" give different answers.
  const deputy = { id: 'deputy-admin-rbac-1', role: 'ADMIN' as const };
  const manager = { id: 'manager-rbac-1', role: 'MANAGER' as const };

  // This suite's people: the manager may edit the catalogue and nothing else,
  // and exactly one of the two ADMIN ids owns the shop.
  const permissionRepositoryMock = createPermissionRepositoryMock({
    grants: { MANAGER: ['products:read', 'products:write'] },
    isOwnerFor: (userId) => userId === admin.id,
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
    // The action log is one of the surfaces this suite gates, so it has to be
    // reachable for a caller who IS allowed — a 500 would prove nothing about
    // the guard.
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
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

  // ─── POST /api/products (PermissionGuard, products:write) ───────────────────

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

  // ─── The three staff levels (TASK-475) ──────────────────────────────────────

  describe('the OWNER', () => {
    const ownerAuth = () => `Bearer ${token(admin.id, admin.role)}`;

    it('passes an @OwnerOnly route — the reserve is theirs', async () => {
      // `PATCH /api/users/:id/role` is one of the four doors the reserve closes:
      // demoting somebody is how you remove them.
      const response = await request(app.getHttpServer())
        .patch('/api/users/some-user/role')
        .set('Authorization', ownerAuth())
        .send({ role: 'MANAGER' });

      // Past the guard. What the mocked service then does is not this suite's
      // subject — only that 403 is not the answer.
      expect(response.status).not.toBe(403);
    });

    it('passes an ordinary permission route without holding the row', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .set('Authorization', ownerAuth())
        .expect(200);
    });
  });

  describe('a DEPUTY ADMIN — every permission, none of the reserve', () => {
    const deputyAuth = () => `Bearer ${token(deputy.id, deputy.role)}`;

    it('passes every @RequirePermission route without a single granted row', async () => {
      // No `UserPermission` rows exist for this id at all: the mock grants only
      // MANAGER. Passing anyway is the level doing the work.
      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .set('Authorization', deputyAuth())
        .expect(200);

      await request(app.getHttpServer())
        .put('/api/products/prod-rbac-1')
        .set('Authorization', deputyAuth())
        .send({ price: 19.99 })
        .expect(200);
    });

    it('reads the action log — non-grantable is not owner-only (TASK-475)', async () => {
      // `audit:read` replaced `@OwnerOnly` here precisely so a deputy can read it
      // while the owner is away. It is still ungrantable, so no manager can.
      await request(app.getHttpServer())
        .get('/api/admin/audit-log')
        .set('Authorization', deputyAuth())
        .expect(200);
    });

    it('is REFUSED every @OwnerOnly route — the check runs before the admin bypass', async () => {
      // The assertion this task turns on. A deputy passes every permission, so
      // the ONLY thing between them and the four doors that decide who runs the
      // shop is the order of two lines in the guard.
      await request(app.getHttpServer())
        .patch('/api/users/some-user/role')
        .set('Authorization', deputyAuth())
        .send({ role: 'ADMIN' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/users/some-user/password')
        .set('Authorization', deputyAuth())
        .send({ password: 'StrongP@ss123' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', deputyAuth())
        .send({ email: 'x@example.com', password: 'StrongP@ss123', role: 'ADMIN' })
        .expect(403);

      await request(app.getHttpServer())
        .delete('/api/users/some-user')
        .set('Authorization', deputyAuth())
        .expect(403);
    });
  });

  describe('MANAGER — rights granted to the PERSON', () => {
    const managerAuth = () => `Bearer ${token(manager.id, manager.role)}`;

    it('reaches a route they personally hold (products:write)', async () => {
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
        .post('/api/users')
        .set('Authorization', managerAuth())
        .send({ email: 'x@example.com', password: 'StrongP@ss123', role: 'ADMIN' })
        .expect(403);

      await request(app.getHttpServer())
        .patch('/api/users/some-user/role')
        .set('Authorization', managerAuth())
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('is refused the action log — `audit:read` is never offered to anybody', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/audit-log')
        .set('Authorization', managerAuth())
        .expect(403);
    });

    it('with NO rows at all passes nothing (plan 181, invariant 4)', async () => {
      // A newly hired manager, before anybody ticks a box. The intended default
      // is an admin panel that signs in and shows nothing — not a broken state.
      jest.spyOn(permissionRepositoryMock, 'findActor').mockResolvedValue({
        id: manager.id,
        email: 'fresh@test.local',
        role: 'MANAGER' as never,
        isOwner: false,
        permissions: new Set<string>(),
      });

      for (const [method, url] of [
        ['get', '/api/products/admin/list'],
        ['get', '/api/admin/orders'],
        ['get', '/api/users'],
      ] as const) {
        await request(app.getHttpServer())
          [method](url)
          .set('Authorization', managerAuth())
          .expect(403);
      }

      jest.restoreAllMocks();
    });

    it('loses a revoked permission on the NEXT request — there is no cache left to go stale', async () => {
      // Plan 181, invariant 8. Rights arrive on the same read as the actor, so
      // "revoked" and "refused" are one event rather than two a TTL apart: there
      // is no `PUT /api/admin/permissions` any more, and nothing to evict.
      //
      // Baseline: the grant is live.
      await request(app.getHttpServer())
        .put('/api/products/prod-rbac-1')
        .set('Authorization', managerAuth())
        .send({ price: 19.99 })
        .expect(200);

      // The row disappears. The manager's access token is untouched and still
      // says MANAGER for another 15 minutes.
      jest.spyOn(permissionRepositoryMock, 'findActor').mockResolvedValue({
        id: manager.id,
        email: 'manager@test.local',
        role: 'MANAGER' as never,
        isOwner: false,
        permissions: new Set(['products:read']),
      });

      productServiceMock.update.mockClear();

      await request(app.getHttpServer())
        .put('/api/products/prod-rbac-1')
        .set('Authorization', managerAuth())
        .send({ price: 24.99 })
        .expect(403);

      expect(productServiceMock.update).not.toHaveBeenCalled();

      // …while the permission that was NOT revoked still works, proving the
      // refusal above is the revocation and not a blanket lockout.
      await request(app.getHttpServer())
        .get('/api/products/admin/list')
        .set('Authorization', managerAuth())
        .expect(200);

      jest.restoreAllMocks();
    });

    it('has no role-matrix API left to call', async () => {
      // The endpoint that edited role grants is gone with the model it edited.
      // Asserted because a route that answers 404 and a route that answers 403
      // are very different things to a frontend, and TASK-480 needs to know
      // which one it is replacing.
      await request(app.getHttpServer())
        .get('/api/admin/permissions')
        .set('Authorization', `Bearer ${token(admin.id, admin.role)}`)
        .expect(404);
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
      expect(response.body.data.isAdmin).toBe(true);
      expect(response.body.data.permissions).toContain('orders:read');
      expect(response.body.data.permissions).toContain('products:write');
    });

    it('reports a deputy admin as holding everything WITHOUT calling them the owner', async () => {
      // What the admin panel keys its owner-reserve controls off. Saying
      // `isOwner: true` here would render a deputy every button that can only
      // 403 — the exact fallback the frontend dropped in TASK-475.
      const response = await request(app.getHttpServer())
        .get('/api/auth/me/permissions')
        .set('Authorization', `Bearer ${token(deputy.id, deputy.role)}`)
        .expect(200);

      expect(response.body.data.isOwner).toBe(false);
      expect(response.body.data.isAdmin).toBe(true);
      expect(response.body.data.permissions).toContain('orders:read');
    });

    it('reports a manager as holding exactly their own rows', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me/permissions')
        .set('Authorization', `Bearer ${token(manager.id, manager.role)}`)
        .expect(200);

      expect(response.body.data).toEqual({
        role: 'MANAGER',
        isOwner: false,
        isAdmin: false,
        permissions: ['products:read', 'products:write'],
      });
    });

    it('reports a customer as holding nothing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me/permissions')
        .set('Authorization', `Bearer ${token(customer.id, customer.role)}`)
        .expect(200);

      expect(response.body.data).toEqual({
        role: 'CUSTOMER',
        isOwner: false,
        isAdmin: false,
        permissions: [],
      });
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/auth/me/permissions').expect(401);
    });
  });
});
