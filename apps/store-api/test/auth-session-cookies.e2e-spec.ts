import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AuthRepository } from '../src/auth/auth.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';
import { CartService } from '../src/cart/cart.service';
import { WishlistService } from '../src/wishlist/wishlist.service';

/**
 * The session cookies a sign-in leaves in the browser (TASK-789).
 *
 * Boots the app with `JWT_REFRESH_EXPIRATION=30d` — deliberately NOT the 7-day
 * default, because a hard-coded seven-day Max-Age is exactly the defect: with a
 * 30-day token the cookie still died on day eight.
 *
 * The variable is set BEFORE AppModule is imported (a require inside
 * beforeAll): ConfigModule snapshots the validated environment when the module
 * is evaluated, and a static import is hoisted above any assignment in this file.
 * It is removed again in afterAll so no later suite in the same worker inherits it.
 */
const REFRESH_EXPIRATION = '30d';
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60; // 2592000

describe('Auth session cookies (e2e)', () => {
  let app: INestApplication;
  let cartService: CartService;
  let wishlistService: WishlistService;
  const previous = process.env.JWT_REFRESH_EXPIRATION;

  const USER_ID = 'user-cookie-1';
  const credentials = { email: 'cookie-e2e@example.com', password: 'TestP@ss123' };

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
    recordFailedLogin: jest.fn().mockResolvedValue(1),
    lockLoginUntil: jest.fn(),
    clearFailedLogins: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_REFRESH_EXPIRATION = REFRESH_EXPIRATION;
    // require, not import(): ts-jest here leaves a dynamic import as ESM, which
    // Jest cannot run without --experimental-vm-modules.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      // Disable every rate limit by replacing the counter (see auth.e2e-spec.ts).
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();

    cartService = moduleFixture.get(CartService);
    wishlistService = moduleFixture.get(WishlistService);
    app = moduleFixture.createNestApplication();
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
    await app?.close();
    if (previous === undefined) {
      delete process.env.JWT_REFRESH_EXPIRATION;
    } else {
      process.env.JWT_REFRESH_EXPIRATION = previous;
    }
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    authRepositoryMock.findByEmail.mockResolvedValue({
      id: USER_ID,
      email: credentials.email,
      passwordHash: await argon2.hash(credentials.password),
      role: 'CUSTOMER',
      isActive: true,
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    authRepositoryMock.saveRefreshToken.mockResolvedValue({});
  });

  /** The raw `Set-Cookie` line for one cookie name, or undefined. */
  function cookieLine(res: request.Response, name: string): string | undefined {
    const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
    const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return lines.find((line) => line.startsWith(`${name}=`));
  }

  describe('refresh cookie Max-Age follows JWT_REFRESH_EXPIRATION (TASK-789)', () => {
    it('sets Max-Age=2592000 on login when the refresh token lives 30 days', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);

      const refresh = cookieLine(res, 'refreshToken');
      expect(refresh).toBeDefined();
      expect(refresh).toContain(`Max-Age=${THIRTY_DAYS_SECONDS}`);
      expect(refresh).toMatch(/Path=\/api\/auth\/refresh/);
      expect(refresh).toMatch(/HttpOnly/i);
    });

    it('persists the token with the same 30-day expiry the cookie advertises', async () => {
      const before = Date.now();
      await request(app.getHttpServer()).post('/api/auth/login').send(credentials).expect(200);

      const [, , expiresAt] = authRepositoryMock.saveRefreshToken.mock.calls[0] as [
        string,
        string,
        Date,
      ];
      const ttlSeconds = Math.round((expiresAt.getTime() - before) / 1000);
      expect(Math.abs(ttlSeconds - THIRTY_DAYS_SECONDS)).toBeLessThanOrEqual(5);
    });
  });

  describe('guest cookies are cleared only after a successful merge (TASK-792)', () => {
    const guestCookies = 'cartToken=guest-cart-tok; wishlistToken=guest-wish-tok';

    it('clears both guest cookies when both merges succeed, merging into the signed-in user', async () => {
      const cartMerge = jest.spyOn(cartService, 'mergeGuestCart').mockResolvedValue();
      const wishMerge = jest.spyOn(wishlistService, 'mergeGuestWishlist').mockResolvedValue();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', guestCookies)
        .send(credentials)
        .expect(200);

      expect(cartMerge).toHaveBeenCalledWith('guest-cart-tok', USER_ID);
      expect(wishMerge).toHaveBeenCalledWith('guest-wish-tok', USER_ID);
      expect(cookieLine(res, 'cartToken')).toMatch(/^cartToken=;.*Max-Age=0/i);
      expect(cookieLine(res, 'wishlistToken')).toMatch(/^wishlistToken=;.*Max-Age=0/i);
    });

    it('keeps the cart cookie when the cart merge fails, and still clears the merged wishlist', async () => {
      jest.spyOn(cartService, 'mergeGuestCart').mockRejectedValue(new Error('merge failure'));
      jest.spyOn(wishlistService, 'mergeGuestWishlist').mockResolvedValue();

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', guestCookies)
        .send(credentials)
        .expect(200);

      // Sign-in is never blocked by a merge.
      expect(res.body.data.accessToken).toBeDefined();
      expect(cookieLine(res, 'cartToken')).toBeUndefined();
      expect(cookieLine(res, 'wishlistToken')).toMatch(/Max-Age=0/i);
    });

    it('keeps both guest cookies when both merges fail', async () => {
      jest.spyOn(cartService, 'mergeGuestCart').mockRejectedValue(new Error('merge failure'));
      jest
        .spyOn(wishlistService, 'mergeGuestWishlist')
        .mockRejectedValue(new Error('merge failure'));

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', guestCookies)
        .send(credentials)
        .expect(200);

      expect(cookieLine(res, 'cartToken')).toBeUndefined();
      expect(cookieLine(res, 'wishlistToken')).toBeUndefined();
      // The session itself is still issued.
      expect(cookieLine(res, 'refreshToken')).toContain(`Max-Age=${THIRTY_DAYS_SECONDS}`);
    });

    it('merges into the id of a freshly registered account', async () => {
      authRepositoryMock.findByEmail.mockResolvedValue(null);
      authRepositoryMock.createUser.mockResolvedValue({
        id: 'user-new-1',
        email: 'new-cookie@example.com',
        role: 'CUSTOMER',
      });
      const cartMerge = jest.spyOn(cartService, 'mergeGuestCart').mockResolvedValue();
      jest.spyOn(wishlistService, 'mergeGuestWishlist').mockResolvedValue();

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('Cookie', guestCookies)
        .send({
          email: 'new-cookie@example.com',
          password: 'TestP@ss123',
          firstName: 'New',
          lastName: 'Cookie',
        })
        .expect(201);

      expect(cartMerge).toHaveBeenCalledWith('guest-cart-tok', 'user-new-1');
    });
  });
});
