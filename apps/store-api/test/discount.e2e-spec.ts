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
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

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
    findActiveWindowCandidates: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDeactivate: jest.fn(),
    countUserRedemptions: jest.fn(),
    tryIncrementRedeemed: jest.fn(),
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
      showOnPromoPage: true,
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
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
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

    it('200 for a private (unpublished) code entered by code (TASK-731)', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(
        makeDiscount({ code: 'PARTNER', showOnPromoPage: false }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/cart/discount/preview')
        .set('Authorization', `Bearer ${token(testCustomer.id, 'CUSTOMER')}`)
        .send({ code: 'partner' })
        .expect(200);

      expect(res.body.data).toMatchObject({ code: 'PARTNER', amount: '20.00' });
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

  // ─── GET /api/discounts/active (public feed, TASK-179) ──────────────────────

  describe('GET /api/discounts/active', () => {
    it('200 with no Authorization header (public)', async () => {
      discountRepositoryMock.findActiveWindowCandidates.mockResolvedValue([makeDiscount()]);

      const res = await request(app.getHttpServer()).get('/api/discounts/active').expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ code: 'SUMMER10', type: DiscountType.PERCENT });
    });

    it('omits an exhausted-cap discount and never leaks caps/counts', async () => {
      discountRepositoryMock.findActiveWindowCandidates.mockResolvedValue([
        makeDiscount({ code: 'LIVE', maxRedemptions: 10, redeemedCount: 1 }),
        makeDiscount({ code: 'EXHAUSTED', maxRedemptions: 5, redeemedCount: 5 }),
      ]);

      const res = await request(app.getHttpServer()).get('/api/discounts/active').expect(200);

      expect(res.body.data.map((d: { code: string }) => d.code)).toEqual(['LIVE']);
      expect(res.body.data[0]).not.toHaveProperty('redeemedCount');
      expect(res.body.data[0]).not.toHaveProperty('maxRedemptions');
      expect(res.body.data[0]).not.toHaveProperty('id');
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

    it('201 create is private by default and publishes on request (TASK-731)', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(null);
      discountRepositoryMock.create.mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve(makeDiscount(input)),
      );
      const auth = `Bearer ${token(testAdmin.id, 'ADMIN')}`;

      const priv = await request(app.getHttpServer())
        .post('/api/admin/discounts')
        .set('Authorization', auth)
        .send({ code: 'PARTNER', type: 'PERCENT', value: 5 })
        .expect(201);
      expect(priv.body.data.showOnPromoPage).toBe(false);

      const pub = await request(app.getHttpServer())
        .post('/api/admin/discounts')
        .set('Authorization', auth)
        .send({ code: 'PUBLIC5', type: 'PERCENT', value: 5, showOnPromoPage: true })
        .expect(201);
      expect(pub.body.data.showOnPromoPage).toBe(true);
    });

    it('400 create with an out-of-range percent value', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/admin/discounts')
        .set('Authorization', `Bearer ${token(testAdmin.id, 'ADMIN')}`)
        .send({ code: 'BIG', type: 'PERCENT', value: 150 })
        .expect(400);
    });

    it('400 (not 500) create with minSpend: null (TASK-797)', async () => {
      discountRepositoryMock.findByCode.mockResolvedValue(null);
      discountRepositoryMock.create.mockResolvedValue(makeDiscount({ code: 'NULLMIN' }));

      const res = await request(app.getHttpServer())
        .post('/api/admin/discounts')
        .set('Authorization', `Bearer ${token(testAdmin.id, 'ADMIN')}`)
        .send({ code: 'NULLMIN', type: 'PERCENT', value: 5, minSpend: null })
        .expect(400);

      expect(JSON.stringify(res.body.message)).toContain('minSpend');
      expect(discountRepositoryMock.create).not.toHaveBeenCalled();
    });

    // ─── PATCH /api/admin/discounts/:id (TASK-823) ──────────────────────────
    //
    // The admin form sends `null` for a cleared field, and the DTO is a
    // PartialType — so what matters end to end is how the three states (not
    // sent / null / value) cross the ValidationPipe into the write.
    describe('PATCH /api/admin/discounts/:id', () => {
      const stored = () =>
        makeDiscount({
          minSpend: new Prisma.Decimal('500'),
          maxRedemptions: 100,
          startsAt: new Date('2026-10-01T00:00:00.000Z'),
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        });
      const adminAuth = () => `Bearer ${token(testAdmin.id, 'ADMIN')}`;
      const patch = (body: Record<string, unknown>, id = 'd-e2e-1') =>
        request(app.getHttpServer())
          .patch(`/api/admin/discounts/${id}`)
          .set('Authorization', adminAuth())
          .send(body);

      beforeEach(() => {
        discountRepositoryMock.findById.mockResolvedValue(stored());
        discountRepositoryMock.findByCode.mockResolvedValue(null);
        discountRepositoryMock.update.mockImplementation(
          (_id: string, input: Record<string, unknown>) =>
            Promise.resolve({ ...stored(), ...input }),
        );
      });

      it('401 without a token', async () => {
        await request(app.getHttpServer())
          .patch('/api/admin/discounts/d-e2e-1')
          .send({ isActive: false })
          .expect(401);
      });

      it('403 for a customer, and nothing is written', async () => {
        await request(app.getHttpServer())
          .patch('/api/admin/discounts/d-e2e-1')
          .set('Authorization', `Bearer ${token(testCustomer.id, 'CUSTOMER')}`)
          .send({ isActive: false })
          .expect(403);

        expect(discountRepositoryMock.update).not.toHaveBeenCalled();
      });

      it('200 writes only the field that was sent', async () => {
        const res = await patch({ isActive: false }).expect(200);

        expect(discountRepositoryMock.update).toHaveBeenCalledWith('d-e2e-1', { isActive: false });
        expect(res.body.data).toMatchObject({ id: 'd-e2e-1', isActive: false, minSpend: '500' });
      });

      it('200 clears nullable fields sent as null (the admin form does this)', async () => {
        const res = await patch({
          minSpend: null,
          maxRedemptions: null,
          perUserLimit: null,
          startsAt: null,
          expiresAt: null,
        }).expect(200);

        expect(discountRepositoryMock.update).toHaveBeenCalledWith('d-e2e-1', {
          minSpend: null,
          maxRedemptions: null,
          perUserLimit: null,
          startsAt: null,
          expiresAt: null,
        });
        expect(res.body.data).toMatchObject({ minSpend: null, startsAt: null, expiresAt: null });
      });

      it('200 clearing startsAt lets an expiry before the stored start through (TASK-798)', async () => {
        await patch({ startsAt: null, expiresAt: '2026-09-01T00:00:00.000Z' }).expect(200);

        expect(discountRepositoryMock.update).toHaveBeenCalledWith('d-e2e-1', {
          startsAt: null,
          expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        });
      });

      it('200 normalizes a renamed code to uppercase before checking and writing it', async () => {
        await patch({ code: '  autumn15 ' }).expect(200);

        expect(discountRepositoryMock.findByCode).toHaveBeenCalledWith('AUTUMN15');
        expect(discountRepositoryMock.update).toHaveBeenCalledWith('d-e2e-1', {
          code: 'AUTUMN15',
        });
      });

      it('400 when the new code belongs to another discount, and nothing is written', async () => {
        discountRepositoryMock.findByCode.mockResolvedValue(
          makeDiscount({ id: 'd-e2e-2', code: 'TAKEN' }),
        );

        const res = await patch({ code: 'taken' }).expect(400);

        expect(JSON.stringify(res.body.message)).toContain('TAKEN');
        expect(discountRepositoryMock.update).not.toHaveBeenCalled();
      });

      it('400 for a PERCENT value above 100 on the merged definition', async () => {
        await patch({ value: 150 }).expect(400);

        expect(discountRepositoryMock.update).not.toHaveBeenCalled();
      });

      it('400 for a start after the STORED expiry', async () => {
        const res = await patch({ startsAt: '2027-01-01T00:00:00.000Z' }).expect(400);

        expect(JSON.stringify(res.body.message)).toContain('startsAt must be before expiresAt');
        expect(discountRepositoryMock.update).not.toHaveBeenCalled();
      });

      it('400 for a date that is not ISO 8601', async () => {
        await patch({ expiresAt: 'next friday' }).expect(400);

        expect(discountRepositoryMock.update).not.toHaveBeenCalled();
      });

      it('400 for a field the DTO does not declare — the redemption counter is not writable', async () => {
        await patch({ redeemedCount: 0 }).expect(400);

        expect(discountRepositoryMock.update).not.toHaveBeenCalled();
      });

      it('404 for an unknown id', async () => {
        discountRepositoryMock.findById.mockResolvedValue(null);

        await patch({ isActive: false }, 'missing').expect(404);

        expect(discountRepositoryMock.update).not.toHaveBeenCalled();
      });
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
