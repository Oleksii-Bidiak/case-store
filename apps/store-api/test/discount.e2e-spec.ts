import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Prisma, DiscountType } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { DiscountRepository } from '../src/discount';
import { CartService } from '../src/cart';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the Discount module (TASK-079).
 *
 * Mocks DiscountRepository (DB), CartService (cart subtotal for preview), and
 * the auth/prisma layers so no real database is needed. JWTs are minted via
 * JwtService to bypass the rate-limited auth endpoints; ThrottlerGuard is
 * overridden with a pass-through. These specs are authored for the integration
 * runner — they are not run inside the worktree.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Discount (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
  };

  const userRepositoryMock = {
    findById: jest.fn(),
  };

  const discountRepositoryMock = {
    findByCode: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDeactivate: jest.fn(),
    countUserRedemptions: jest.fn(),
    incrementRedeemed: jest.fn(),
    createRedemption: jest.fn(),
  };

  const cartServiceMock = {
    getCart: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn() },
    refreshToken: { findUnique: jest.fn() },
  };

  const testAdmin = {
    id: 'admin-e2e-1',
    email: 'e2e-admin@example.com',
    role: 'ADMIN' as const,
    isActive: true,
  };

  const testCustomer = {
    id: 'customer-e2e-1',
    email: 'e2e-customer@example.com',
    role: 'CUSTOMER' as const,
    isActive: true,
  };

  function makeDiscount(overrides: Record<string, unknown> = {}) {
    return {
      id: 'd-e2e-1',
      code: 'SUMMER10',
      type: DiscountType.PERCENT,
      value: new Prisma.Decimal('10'),
      minSpend: null,
      maxRedemptions: null,
      redeemedCount: 0,
      perUserLimit: null,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

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
      .overrideProvider(DiscountRepository)
      .useValue(discountRepositoryMock)
      .overrideProvider(CartService)
      .useValue(cartServiceMock)
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

  beforeEach(() => {
    jest.resetAllMocks();
    // JWT strategy resolves the caller from AuthRepository.findById.
    authRepositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve(id === testAdmin.id ? testAdmin : testCustomer),
    );
    cartServiceMock.getCart.mockResolvedValue({ totals: { subtotal: '200.00' } });
  });

  // ─── POST /api/cart/discount/preview ────────────────────────────────────────

  describe('POST /api/cart/discount/preview', () => {
    it('401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/cart/discount/preview')
        .send({ code: 'SUMMER10' })
        .expect(401);
    });

    it('200 with the computed discount for a valid percent code', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(makeDiscount());

      const res = await request(app.getHttpServer())
        .post('/api/cart/discount/preview')
        .set('Authorization', `Bearer ${token(testCustomer.id, 'CUSTOMER')}`)
        .send({ code: 'summer10' })
        .expect(200);

      expect(res.body.data).toMatchObject({
        code: 'SUMMER10',
        type: DiscountType.PERCENT,
        amount: '20.00',
        newTotal: '180.00',
      });
    });

    it('400 DISCOUNT_NOT_FOUND for an unknown code', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/cart/discount/preview')
        .set('Authorization', `Bearer ${token(testCustomer.id, 'CUSTOMER')}`)
        .send({ code: 'NOPE' })
        .expect(400);

      expect(res.body.error).toBe('DISCOUNT_NOT_FOUND');
    });

    it('400 DISCOUNT_EXPIRED for an expired code', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(
        makeDiscount({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/cart/discount/preview')
        .set('Authorization', `Bearer ${token(testCustomer.id, 'CUSTOMER')}`)
        .send({ code: 'SUMMER10' })
        .expect(400);

      expect(res.body.error).toBe('DISCOUNT_EXPIRED');
    });

    it('400 DISCOUNT_MIN_SPEND_NOT_MET when below the minimum', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(
        makeDiscount({ minSpend: new Prisma.Decimal('500') }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/cart/discount/preview')
        .set('Authorization', `Bearer ${token(testCustomer.id, 'CUSTOMER')}`)
        .send({ code: 'SUMMER10' })
        .expect(400);

      expect(res.body.error).toBe('DISCOUNT_MIN_SPEND_NOT_MET');
    });

    it('409 DISCOUNT_MAX_REDEMPTIONS_REACHED when the global cap is hit', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(
        makeDiscount({ maxRedemptions: 5, redeemedCount: 5 }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/cart/discount/preview')
        .set('Authorization', `Bearer ${token(testCustomer.id, 'CUSTOMER')}`)
        .send({ code: 'SUMMER10' })
        .expect(409);

      expect(res.body.error).toBe('DISCOUNT_MAX_REDEMPTIONS_REACHED');
    });
  });

  // ─── Admin CRUD + RBAC ──────────────────────────────────────────────────────

  describe('Admin /api/admin/discounts', () => {
    it('403 for a non-admin listing', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/discounts')
        .set('Authorization', `Bearer ${token(testCustomer.id, 'CUSTOMER')}`)
        .expect(403);
    });

    it('200 list for an admin', async () => {
      discountRepositoryMock.findMany.mockResolvedValue({ discounts: [makeDiscount()], total: 1 });

      const res = await request(app.getHttpServer())
        .get('/api/admin/discounts')
        .set('Authorization', `Bearer ${token(testAdmin.id, 'ADMIN')}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ total: 1, page: 1 });
    });

    it('201 create for an admin', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(null);
      discountRepositoryMock.create.mockResolvedValue(makeDiscount({ code: 'WELCOME5' }));

      const res = await request(app.getHttpServer())
        .post('/api/admin/discounts')
        .set('Authorization', `Bearer ${token(testAdmin.id, 'ADMIN')}`)
        .send({ code: 'welcome5', type: 'PERCENT', value: 5 })
        .expect(201);

      expect(res.body.data).toMatchObject({ code: 'WELCOME5' });
      expect(discountRepositoryMock.create).toHaveBeenCalled();
    });

    it('400 create with an out-of-range percent value', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/admin/discounts')
        .set('Authorization', `Bearer ${token(testAdmin.id, 'ADMIN')}`)
        .send({ code: 'BIG', type: 'PERCENT', value: 150 })
        .expect(400);
    });

    it('200 deactivate for an admin', async () => {
      discountRepositoryMock.findById.mockResolvedValue(makeDiscount());
      discountRepositoryMock.softDeactivate.mockResolvedValue(makeDiscount({ isActive: false }));

      const res = await request(app.getHttpServer())
        .delete('/api/admin/discounts/d-e2e-1')
        .set('Authorization', `Bearer ${token(testAdmin.id, 'ADMIN')}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ id: 'd-e2e-1' });
    });
  });
});
