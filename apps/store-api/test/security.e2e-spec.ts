import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { CartRepository } from '../src/cart/cart.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';
import { CsrfService } from '../src/csrf';
import { buildHelmetOptions } from '../src/config/security.config';

/**
 * E2E tests for the Phase 5 security hardening (TASK-046):
 * - CSRF (signed double-submit) on cookie-authenticated, state-changing routes.
 * - Helmet security headers.
 * - Rate limiting (live 429 via the real ThrottlerGuard).
 *
 * Unlike the other e2e suites, this one replicates the `main.ts` middleware
 * stack (helmet + CSRF) and keeps the REAL ThrottlerGuard so the throttle limit
 * is actually exercised. The Redis throttler store is forced off (REDIS_HOST='')
 * so the in-memory limiter is deterministic regardless of the local `.env`.
 */
describe('Security hardening (e2e)', () => {
  let app: INestApplication;

  // This suite is the only one that keeps the REAL ThrottlerGuard and forces the
  // in-memory store via `process.env.REDIS_HOST = ''`. Those env mutations are
  // process-global and, if left in place, leak into every suite that runs after
  // this one in the same Jest worker (selecting a different throttler storage
  // than that suite intends). Snapshot the keys we touch and restore them in
  // afterAll so this suite stays fully isolated.
  const envSnapshot: Record<string, string | undefined> = {};
  const MUTATED_ENV_KEYS = ['REDIS_HOST', 'CSRF_SECRET'] as const;

  const authRepositoryMock = {
    findByEmail: jest.fn().mockResolvedValue(null), // login → 401
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
  };

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

  beforeAll(async () => {
    // Snapshot the env keys we are about to mutate so afterAll can restore them
    // and prevent cross-suite leakage of the throttler-storage selection.
    for (const key of MUTATED_ENV_KEYS) {
      envSnapshot[key] = process.env[key];
    }

    // Force the in-memory throttler store + a deterministic CSRF secret,
    // independent of whatever the local .env contains.
    process.env.REDIS_HOST = '';
    process.env.CSRF_SECRET = 'e2e-csrf-secret-at-least-32-characters-long';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }), AppModule],
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
      .compile();

    app = moduleFixture.createNestApplication();

    // Replicate the main.ts middleware stack.
    app.use(helmet(buildHelmetOptions(false)));
    app.use(cookieParser());
    const csrfService = app.get(CsrfService);
    app.use('/api/auth/refresh', csrfService.protect);
    app.use('/api/cart', csrfService.protect);
    app.use('/api/wishlist', csrfService.protect);

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

    // Restore the env keys this suite mutated so later suites see the original
    // environment (and pick their own throttler storage) deterministically.
    for (const key of MUTATED_ENV_KEYS) {
      if (envSnapshot[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envSnapshot[key];
      }
    }
  });

  // ─── Helmet headers ──────────────────────────────────────────────────────────

  describe('Helmet headers', () => {
    it('sets Content-Security-Policy and X-Frame-Options on responses', async () => {
      const res = await request(app.getHttpServer()).get('/api/csrf-token');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  // ─── CSRF ────────────────────────────────────────────────────────────────────

  describe('CSRF protection', () => {
    it('GET /api/csrf-token issues a token and a readable csrf cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/csrf-token').expect(200);

      expect(res.body?.data?.csrfToken).toEqual(expect.any(String));
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(setCookie.some((c) => c.startsWith('csrf='))).toBe(true);
    });

    it('rejects POST /api/cart/items without a CSRF token (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/cart/items')
        .send({ productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 })
        .expect(403);
    });

    it('rejects POST /api/auth/refresh without a CSRF token (403)', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').expect(403);
    });

    it('allows POST /api/cart/items with a valid CSRF token (not 403)', async () => {
      const tokenRes = await request(app.getHttpServer()).get('/api/csrf-token');
      const csrfToken = tokenRes.body.data.csrfToken as string;

      const res = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Cookie', [`csrf=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ productId: 'not-a-uuid', quantity: 1 }); // invalid body → 400

      expect(res.status).not.toBe(403);
      expect(res.status).toBe(400);
    });

    it('exempts Bearer-authenticated requests from the CSRF check', async () => {
      // No CSRF token, but an Authorization header is present → must not be 403.
      const res = await request(app.getHttpServer())
        .post('/api/cart/items')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send({ productId: 'not-a-uuid', quantity: 1 });

      expect(res.status).not.toBe(403);
    });

    // The wishlist is cookie-identified exactly like the guest cart
    // (`wishlistToken`), so its mutating routes are equally CSRF-vulnerable and
    // must be behind the same middleware.
    it('rejects POST /api/wishlist/items without a CSRF token (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/wishlist/items')
        .send({ productId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(403);
    });

    it('rejects POST /api/wishlist/toggle without a CSRF token (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/wishlist/toggle')
        .send({ productId: '550e8400-e29b-41d4-a716-446655440000' })
        .expect(403);
    });

    it('rejects DELETE /api/wishlist/items/:productId without a CSRF token (403)', async () => {
      await request(app.getHttpServer())
        .delete('/api/wishlist/items/550e8400-e29b-41d4-a716-446655440000')
        .expect(403);
    });

    it('allows POST /api/wishlist/items with a valid CSRF token (not 403)', async () => {
      const tokenRes = await request(app.getHttpServer()).get('/api/csrf-token');
      const csrfToken = tokenRes.body.data.csrfToken as string;

      const res = await request(app.getHttpServer())
        .post('/api/wishlist/items')
        .set('Cookie', [`csrf=${csrfToken}`])
        .set('x-csrf-token', csrfToken)
        .send({ productId: 'not-a-uuid' }); // invalid body → 400

      expect(res.status).not.toBe(403);
      expect(res.status).toBe(400);
    });

    it('exempts Bearer-authenticated wishlist requests from the CSRF check', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/wishlist/items')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send({ productId: 'not-a-uuid' });

      expect(res.status).not.toBe(403);
    });
  });

  // ─── Rate limiting (live) ─────────────────────────────────────────────────────

  describe('Throttling', () => {
    it('returns 429 after exceeding the auth login limit (5/60s)', async () => {
      const body = { email: 'nobody@example.com', password: 'wrongpassword' };
      const statuses: number[] = [];

      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer()).post('/api/auth/login').send(body);
        statuses.push(res.status);
      }

      // First 5 attempts hit the handler (401 invalid creds); the 6th is blocked.
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses[5]).toBe(429);
    });
  });
});
