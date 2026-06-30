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

/**
 * RBAC guard-behaviour e2e tests.
 *
 * Verifies the 401-vs-403 contract on admin-only endpoints end to end, through
 * the real guards (JwtAuthGuard + AdminGuard / RolesGuard):
 *   - no JWT              → 401 (authentication missing)
 *   - CUSTOMER JWT        → 403 (authenticated, wrong role)
 *   - ADMIN JWT           → guard passes (reaches the mocked service)
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

  const validProduct = {
    name: 'RBAC Test Product',
    price: 29.99,
    categoryId: '550e8400-e29b-41d4-a716-446655440000',
  };

  // ProductService is mocked so the ADMIN create path returns without a DB.
  const productServiceMock = {
    create: jest.fn().mockResolvedValue({ id: 'prod-rbac-1', ...validProduct }),
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
});
