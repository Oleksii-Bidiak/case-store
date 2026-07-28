import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { CartRepository, CartWithItems } from '../src/cart/cart.repository';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the Cart module — GUEST path and merge-on-login flow.
 *
 * Guests have no JWT; their cart is identified by an HttpOnly `cartToken`
 * cookie issued by CartIdentityInterceptor. This suite drives the cookie
 * explicitly via supertest and mocks CartRepository — the clean-architecture
 * boundary — so no real database is needed.
 *
 * The merge-on-login tests assert the AuthController wiring: that login reads
 * the `cartToken` cookie, calls CartService.mergeGuestCart, clears the cookie
 * ONLY on success, and never lets a merge failure block authentication. The
 * merge's data logic is unit-tested in cart.service.spec.ts; here the service
 * method is spied on to isolate the controller behaviour.
 *
 * cookie-parser is applied explicitly (main.ts does this in production) so
 * `request.cookies` is populated in the test app. ThrottlerGuard is overridden
 * with a pass-through guard to disable rate limiting during tests.
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Cart — guest & merge (e2e)', () => {
  let app: INestApplication;
  let cartService: CartService;

  // Valid v4 UUID for request bodies (AddToCartDto enforces @IsUUID(4))
  const VALID_PRODUCT_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const GUEST_TOKEN = 'guest-token-e2e-1';

  // Mock CartRepository — clean architecture boundary
  const cartRepositoryMock = {
    findByUserId: jest.fn(),
    findByToken: jest.fn(),
    findById: jest.fn(),
    findOrCreate: jest.fn(),
    assignCartToUser: jest.fn(),
    mergeGuestCartIntoUser: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    clearItems: jest.fn(),
    findItem: jest.fn(),
    findProductForCartValidation: jest.fn(),
  };

  // Mock AuthRepository — for login + JWT strategy user lookup
  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  // Mock UserRepository — lets AppModule bootstrap without a DB
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
    // The add-on applicability resolver (TASK-174) runs on every cart read via the
    // real CategoryRepository / AddonServiceRepository. No add-on services exist in
    // this suite's fixture, so every lookup answers empty — the resolver must yield
    // an empty set, not blow up on a missing mock member.
    $queryRaw: jest.fn().mockResolvedValue([]),
    addonService: { findMany: jest.fn().mockResolvedValue([]) },
    categoryAddonTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    addonServiceDelta: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  // ─── Test data ──────────────────────────────────────────────────────────────

  const testProduct = {
    id: 'prod-e2e-1',
    name: 'iPhone 15 Pro Case — Clear MagSafe',
    price: { toString: () => '29.99' },
    compareAtPrice: null,
    isActive: true,
    // TASK-297: the line's availability now folds in the CATEGORY's status, so
    // CART_ITEMS_INCLUDE joins it — the mock must supply it or fromPrisma throws.
    category: { isActive: true },
    // CartItemEntity.fromPrisma reads product.images (CART_ITEMS_INCLUDE always
    // selects it in prod); the mock must supply it or `images[0]` throws → 500.
    images: [],
  };

  const guestCartItem = {
    id: 'guest-item-1',
    productId: 'prod-e2e-1',
    variantId: null,
    quantity: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    product: testProduct,
    variant: null,
  };

  const makeGuestCart = (items: CartWithItems['items'] = []): CartWithItems => ({
    id: 'guest-cart-e2e-1',
    userId: null,
    token: GUEST_TOKEN,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items,
  });

  function expectCartShape(body: Record<string, unknown>): void {
    expect(body).toHaveProperty('data');
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('totals');
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
      .overrideProvider(CartRepository)
      .useValue(cartRepositoryMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    cartService = moduleFixture.get<CartService>(CartService);

    // main.ts applies cookie-parser; replicate it so request.cookies is populated.
    app.use(cookieParser());

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
    jest.resetAllMocks();
  });

  // `resetAllMocks` above wipes implementations, so the add-on resolver's
  // empty-catalog defaults must be re-armed before every test — otherwise its
  // queries resolve to `undefined` and every cart read 500s (TASK-174).
  beforeEach(() => {
    prismaServiceMock.$queryRaw.mockResolvedValue([]);
    prismaServiceMock.addonService.findMany.mockResolvedValue([]);
    prismaServiceMock.categoryAddonTemplate.findMany.mockResolvedValue([]);
    prismaServiceMock.addonServiceDelta.findMany.mockResolvedValue([]);
  });

  // ─── Guest cart — no cookie ──────────────────────────────────────────────────

  describe('Guest cart — no cookie', () => {
    it('GET /api/cart with no JWT and no cookie → 200 empty cart and issues an HttpOnly cartToken cookie', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(makeGuestCart([]));

      const res = await request(app.getHttpServer()).get('/api/cart').expect(200);

      expectCartShape(res.body);
      expect(res.body.data.userId).toBeNull();
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.totals.itemCount).toBe(0);

      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toContain('cartToken=');
      expect(setCookie).toMatch(/HttpOnly/i);

      // The interceptor resolved a token-based identity (a freshly minted UUID).
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'token' }),
      );
    });
  });

  // ─── Guest cart — with cookie ────────────────────────────────────────────────

  describe('Guest cart — with cartToken cookie', () => {
    it('POST /api/cart/items → 201 and adds the item to the guest cart for that token', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(makeGuestCart([]));
      cartRepositoryMock.findProductForCartValidation.mockResolvedValue({
        id: VALID_PRODUCT_UUID,
        name: 'iPhone 15 Pro Case — Clear MagSafe',
        stock: 50,
        isActive: true,
        category: { isActive: true },
      });
      cartRepositoryMock.addItem.mockResolvedValue(makeGuestCart([guestCartItem]));

      const res = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Cookie', `cartToken=${GUEST_TOKEN}`)
        .send({ productId: VALID_PRODUCT_UUID, quantity: 1 })
        .expect(201);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.userId).toBeNull();
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith({
        type: 'token',
        token: GUEST_TOKEN,
      });
    });

    it('GET /api/cart returns the same guest cart for the cookie token', async () => {
      cartRepositoryMock.findOrCreate.mockResolvedValue(makeGuestCart([guestCartItem]));

      const res = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Cookie', `cartToken=${GUEST_TOKEN}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith({
        type: 'token',
        token: GUEST_TOKEN,
      });
    });

    it('PATCH /api/cart/items/:itemId → 200 and updates the quantity in the guest cart', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(makeGuestCart([guestCartItem]));
      cartRepositoryMock.updateItem.mockResolvedValue({ ...guestCartItem, quantity: 3 });
      cartRepositoryMock.findOrCreate.mockResolvedValue(
        makeGuestCart([{ ...guestCartItem, quantity: 3 }]),
      );

      const res = await request(app.getHttpServer())
        .patch('/api/cart/items/guest-item-1')
        .set('Cookie', `cartToken=${GUEST_TOKEN}`)
        .send({ quantity: 3 })
        .expect(200);

      expect(res.body.data.items[0].quantity).toBe(3);
      expect(cartRepositoryMock.findByToken).toHaveBeenCalledWith(GUEST_TOKEN);
      expect(cartRepositoryMock.updateItem).toHaveBeenCalledWith('guest-item-1', { quantity: 3 });
    });

    it('DELETE /api/cart/items/:itemId → 200 and removes the item from the guest cart', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(makeGuestCart([guestCartItem]));
      cartRepositoryMock.removeItem.mockResolvedValue(undefined);
      cartRepositoryMock.findOrCreate.mockResolvedValue(makeGuestCart([]));

      const res = await request(app.getHttpServer())
        .delete('/api/cart/items/guest-item-1')
        .set('Cookie', `cartToken=${GUEST_TOKEN}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
      expect(cartRepositoryMock.removeItem).toHaveBeenCalledWith('guest-item-1');
    });

    it('DELETE /api/cart → 200 and clears the guest cart', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(makeGuestCart([guestCartItem]));
      cartRepositoryMock.clearItems.mockResolvedValue(undefined);
      cartRepositoryMock.findOrCreate.mockResolvedValue(makeGuestCart([]));

      const res = await request(app.getHttpServer())
        .delete('/api/cart')
        .set('Cookie', `cartToken=${GUEST_TOKEN}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
      expect(cartRepositoryMock.clearItems).toHaveBeenCalledWith('guest-cart-e2e-1');
    });

    it('GET /api/cart with an unknown/forged cartToken yields a fresh empty cart (200), never 500 or another user data', async () => {
      // findOrCreate upserts by token, so an unknown token resolves to its own
      // empty cart — a forged token can never surface someone else's cart.
      cartRepositoryMock.findOrCreate.mockResolvedValue(makeGuestCart([]));

      const res = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Cookie', 'cartToken=forged-unknown-token')
        .expect(200);

      expect(res.body.data.userId).toBeNull();
      expect(res.body.data.items).toHaveLength(0);
      expect(cartRepositoryMock.findOrCreate).toHaveBeenCalledWith({
        type: 'token',
        token: 'forged-unknown-token',
      });
    });
  });

  // ─── Merge on login ──────────────────────────────────────────────────────────

  describe('Merge on login', () => {
    const credentials = { email: 'merge-e2e@example.com', password: 'TestP@ss123' };
    const USER_ID = 'user-merge-1';

    async function mockSuccessfulLogin(): Promise<void> {
      const passwordHash = await argon2.hash(credentials.password);
      authRepositoryMock.findByEmail.mockResolvedValue({
        id: USER_ID,
        email: credentials.email,
        passwordHash,
        role: 'CUSTOMER',
        isActive: true,
      });
      authRepositoryMock.saveRefreshToken.mockResolvedValue({
        id: 'rt-merge-1',
        token: 'refresh-token',
        userId: USER_ID,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        createdAt: new Date(),
      });
    }

    it('merges the guest cart and clears the cartToken cookie on a successful login', async () => {
      await mockSuccessfulLogin();
      const mergeSpy = jest.spyOn(cartService, 'mergeGuestCart').mockResolvedValue();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', `cartToken=${GUEST_TOKEN}`)
        .send(credentials)
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      // The cart-merge is invoked with the cookie token and the logged-in user id.
      expect(mergeSpy).toHaveBeenCalledWith(GUEST_TOKEN, USER_ID);

      // The guest cookie is cleared (Max-Age=0) after a successful merge.
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toContain('cartToken=;');
      expect(setCookie).toMatch(/Max-Age=0/i);

      mergeSpy.mockRestore();
    });

    it('does not attempt a merge when no cartToken cookie is present', async () => {
      await mockSuccessfulLogin();
      const mergeSpy = jest.spyOn(cartService, 'mergeGuestCart').mockResolvedValue();

      await request(app.getHttpServer()).post('/api/auth/login').send(credentials).expect(200);

      expect(mergeSpy).not.toHaveBeenCalled();

      mergeSpy.mockRestore();
    });

    it('still returns 200 and does NOT clear the cartToken cookie when the merge fails', async () => {
      await mockSuccessfulLogin();
      const mergeSpy = jest
        .spyOn(cartService, 'mergeGuestCart')
        .mockRejectedValue(new Error('merge failure'));

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', `cartToken=${GUEST_TOKEN}`)
        .send(credentials)
        .expect(200);

      // Login succeeds despite the merge throwing — auth is never blocked.
      expect(res.body.data.accessToken).toBeDefined();
      expect(mergeSpy).toHaveBeenCalledWith(GUEST_TOKEN, USER_ID);

      // The cartToken cookie must NOT be touched on failure, so the guest cart
      // survives and the merge can be retried on the next authenticated request.
      const setCookie = String(res.headers['set-cookie'] ?? '');
      expect(setCookie).not.toContain('cartToken=');

      mergeSpy.mockRestore();
    });
  });
});
