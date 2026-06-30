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
import { WishlistRepository, WishlistWithItems } from '../src/wishlist/wishlist.repository';
import { WishlistService } from '../src/wishlist/wishlist.service';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the Wishlist module — GUEST path and merge-on-login flow.
 *
 * Guests have no JWT; their wishlist is identified by an HttpOnly
 * `wishlistToken` cookie issued by WishlistIdentityInterceptor. This suite
 * drives the cookie explicitly via supertest and mocks WishlistRepository — the
 * clean-architecture boundary — so no real database is needed.
 *
 * The merge-on-login tests assert the AuthController wiring: that login reads
 * the `wishlistToken` cookie, calls WishlistService.mergeGuestWishlist, clears
 * the cookie ONLY on success, and never lets a merge failure block auth. The
 * merge's data logic (no-duplicates, reassign-or-merge) is unit-tested in
 * wishlist.service.spec.ts; here the service method is spied on to isolate the
 * controller behaviour.
 *
 * Mirrors cart-guest.e2e-spec.ts.
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Wishlist — guest & merge (e2e)', () => {
  let app: INestApplication;
  let wishlistService: WishlistService;

  // Valid v4 UUID for request bodies (AddToWishlistDto enforces @IsUUID(4))
  const VALID_PRODUCT_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const GUEST_TOKEN = 'guest-wishlist-token-e2e-1';

  // Mock WishlistRepository — clean architecture boundary
  const wishlistRepositoryMock = {
    findByUserId: jest.fn(),
    findByToken: jest.fn(),
    findOrCreate: jest.fn(),
    addItem: jest.fn(),
    removeItem: jest.fn(),
    findItem: jest.fn(),
    assignWishlistToUser: jest.fn(),
    mergeGuestWishlistIntoUser: jest.fn(),
    findProductForWishlistValidation: jest.fn(),
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
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  // ─── Test data ──────────────────────────────────────────────────────────────

  const buildProduct = (id: string) => ({
    id,
    name: 'iPhone 15 Pro Case — Clear MagSafe',
    slug: 'iphone-15-pro-case-clear-magsafe',
    price: { toString: () => '29.99' },
    compareAtPrice: null,
    stock: 50,
    isActive: true,
    images: [{ url: 'https://cdn.example.com/a.jpg' }],
  });

  const buildItem = (productId: string) => ({
    id: `guest-item-${productId}`,
    productId,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    product: buildProduct(productId),
  });

  const makeGuestWishlist = (items: WishlistWithItems['items'] = []): WishlistWithItems => ({
    id: 'guest-wishlist-e2e-1',
    userId: null,
    token: GUEST_TOKEN,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items,
  });

  function expectWishlistShape(body: Record<string, unknown>): void {
    expect(body).toHaveProperty('data');
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('itemCount');
    // The guest token must never leak into the JSON envelope.
    expect(data).not.toHaveProperty('token');
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
      .overrideProvider(WishlistRepository)
      .useValue(wishlistRepositoryMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    wishlistService = moduleFixture.get<WishlistService>(WishlistService);

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

  // ─── Guest wishlist — no cookie ───────────────────────────────────────────────

  describe('Guest wishlist — no cookie', () => {
    it('GET /api/wishlist with no JWT and no cookie → 200 empty wishlist and issues an HttpOnly wishlistToken cookie', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(makeGuestWishlist([]));

      const res = await request(app.getHttpServer()).get('/api/wishlist').expect(200);

      expectWishlistShape(res.body);
      expect(res.body.data.userId).toBeNull();
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.itemCount).toBe(0);

      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toContain('wishlistToken=');
      expect(setCookie).toMatch(/HttpOnly/i);

      expect(wishlistRepositoryMock.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'token' }),
      );
    });
  });

  // ─── Guest wishlist — with cookie ─────────────────────────────────────────────

  describe('Guest wishlist — with wishlistToken cookie', () => {
    it('POST /api/wishlist/items → 201 and saves the product for that token', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(makeGuestWishlist([]));
      wishlistRepositoryMock.findProductForWishlistValidation.mockResolvedValue({
        id: VALID_PRODUCT_UUID,
      });
      wishlistRepositoryMock.addItem.mockResolvedValue(
        makeGuestWishlist([buildItem(VALID_PRODUCT_UUID)]),
      );

      const res = await request(app.getHttpServer())
        .post('/api/wishlist/items')
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .send({ productId: VALID_PRODUCT_UUID })
        .expect(201);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.itemCount).toBe(1);
      expect(wishlistRepositoryMock.findOrCreate).toHaveBeenCalledWith({
        type: 'token',
        token: GUEST_TOKEN,
      });
    });

    it('POST /api/wishlist/items is idempotent — re-adding the same product keeps a single entry', async () => {
      const saved = makeGuestWishlist([buildItem(VALID_PRODUCT_UUID)]);
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(saved);
      wishlistRepositoryMock.findProductForWishlistValidation.mockResolvedValue({
        id: VALID_PRODUCT_UUID,
      });
      // addItem upserts; the wishlist still has exactly one item.
      wishlistRepositoryMock.addItem.mockResolvedValue(saved);

      const res = await request(app.getHttpServer())
        .post('/api/wishlist/items')
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .send({ productId: VALID_PRODUCT_UUID })
        .expect(201);

      expect(res.body.data.items).toHaveLength(1);
    });

    it('POST /api/wishlist/toggle removes a saved product (toggle off)', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(
        makeGuestWishlist([buildItem(VALID_PRODUCT_UUID)]),
      );
      wishlistRepositoryMock.findItem.mockResolvedValue({ id: 'guest-item-x' });
      wishlistRepositoryMock.removeItem.mockResolvedValue(makeGuestWishlist([]));

      const res = await request(app.getHttpServer())
        .post('/api/wishlist/toggle')
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .send({ productId: VALID_PRODUCT_UUID })
        .expect(201);

      expect(res.body.data.items).toHaveLength(0);
      expect(wishlistRepositoryMock.removeItem).toHaveBeenCalledWith(
        'guest-wishlist-e2e-1',
        VALID_PRODUCT_UUID,
      );
      expect(wishlistRepositoryMock.addItem).not.toHaveBeenCalled();
    });

    it('POST /api/wishlist/toggle adds an unsaved product (toggle on)', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(makeGuestWishlist([]));
      wishlistRepositoryMock.findItem.mockResolvedValue(null);
      wishlistRepositoryMock.findProductForWishlistValidation.mockResolvedValue({
        id: VALID_PRODUCT_UUID,
      });
      wishlistRepositoryMock.addItem.mockResolvedValue(
        makeGuestWishlist([buildItem(VALID_PRODUCT_UUID)]),
      );

      const res = await request(app.getHttpServer())
        .post('/api/wishlist/toggle')
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .send({ productId: VALID_PRODUCT_UUID })
        .expect(201);

      expect(res.body.data.items).toHaveLength(1);
      expect(wishlistRepositoryMock.addItem).toHaveBeenCalledWith(
        'guest-wishlist-e2e-1',
        VALID_PRODUCT_UUID,
      );
    });

    it('DELETE /api/wishlist/items/:productId → 200 and removes the product', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(
        makeGuestWishlist([buildItem(VALID_PRODUCT_UUID)]),
      );
      wishlistRepositoryMock.removeItem.mockResolvedValue(makeGuestWishlist([]));

      const res = await request(app.getHttpServer())
        .delete(`/api/wishlist/items/${VALID_PRODUCT_UUID}`)
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(0);
      expect(wishlistRepositoryMock.removeItem).toHaveBeenCalledWith(
        'guest-wishlist-e2e-1',
        VALID_PRODUCT_UUID,
      );
    });

    it('rejects an invalid productId with 400', async () => {
      wishlistRepositoryMock.findOrCreate.mockResolvedValue(makeGuestWishlist([]));

      await request(app.getHttpServer())
        .post('/api/wishlist/items')
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .send({ productId: 'not-a-uuid' })
        .expect(400);
    });
  });

  // ─── Merge on login ────────────────────────────────────────────────────────────

  describe('Merge on login', () => {
    const credentials = { email: 'wishlist-merge-e2e@example.com', password: 'TestP@ss123' };
    const USER_ID = 'user-wishlist-merge-1';

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
        id: 'rt-wishlist-merge-1',
        token: 'refresh-token',
        userId: USER_ID,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        createdAt: new Date(),
      });
    }

    it('merges the guest wishlist and clears the wishlistToken cookie on a successful login', async () => {
      await mockSuccessfulLogin();
      const mergeSpy = jest.spyOn(wishlistService, 'mergeGuestWishlist').mockResolvedValue();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .send(credentials)
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(mergeSpy).toHaveBeenCalledWith(GUEST_TOKEN, USER_ID);

      // The guest cookie is cleared (Max-Age=0) after a successful merge.
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toContain('wishlistToken=;');
      expect(setCookie).toMatch(/Max-Age=0/i);

      mergeSpy.mockRestore();
    });

    it('does not attempt a merge when no wishlistToken cookie is present', async () => {
      await mockSuccessfulLogin();
      const mergeSpy = jest.spyOn(wishlistService, 'mergeGuestWishlist').mockResolvedValue();

      await request(app.getHttpServer()).post('/api/auth/login').send(credentials).expect(200);

      expect(mergeSpy).not.toHaveBeenCalled();

      mergeSpy.mockRestore();
    });

    it('still returns 200 and does NOT clear the wishlistToken cookie when the merge fails', async () => {
      await mockSuccessfulLogin();
      const mergeSpy = jest
        .spyOn(wishlistService, 'mergeGuestWishlist')
        .mockRejectedValue(new Error('merge failure'));

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .send(credentials)
        .expect(200);

      // Login succeeds despite the merge throwing — auth is never blocked.
      expect(res.body.data.accessToken).toBeDefined();
      expect(mergeSpy).toHaveBeenCalledWith(GUEST_TOKEN, USER_ID);

      // The wishlistToken cookie must NOT be touched on failure, so the guest
      // wishlist survives and the merge can be retried on the next request.
      const setCookie = String(res.headers['set-cookie'] ?? '');
      expect(setCookie).not.toContain('wishlistToken=');

      mergeSpy.mockRestore();
    });

    it('registration also merges the guest wishlist (sibling of cart merge)', async () => {
      authRepositoryMock.findByEmail.mockResolvedValue(null);
      authRepositoryMock.createUser.mockResolvedValue({
        id: USER_ID,
        email: credentials.email,
        role: 'CUSTOMER',
        isActive: true,
      });
      authRepositoryMock.saveRefreshToken.mockResolvedValue({
        id: 'rt-wishlist-reg-1',
        token: 'refresh-token',
        userId: USER_ID,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        createdAt: new Date(),
      });
      const mergeSpy = jest.spyOn(wishlistService, 'mergeGuestWishlist').mockResolvedValue();

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('Cookie', `wishlistToken=${GUEST_TOKEN}`)
        .send({ ...credentials, name: 'Wishlist Tester' })
        .expect(201);

      expect(mergeSpy).toHaveBeenCalledWith(GUEST_TOKEN, USER_ID);

      mergeSpy.mockRestore();
    });
  });
});
