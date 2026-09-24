import { Test } from '@nestjs/testing';
import { Body, Controller, Get, Module, Post, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerModule, type ThrottlerStorage } from '@nestjs/throttler';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  ClientIpThrottlerGuard,
  FailClosedThrottle,
  ThrottlerErrorCode,
  ThrottlerStorageUnavailableError,
} from '../src/throttler';
import { OrderController } from '../src/order/order.controller';
import { OrderService } from '../src/order/order.service';
import { JwtAuthGuard } from '../src/auth';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { EmailVerificationService } from '../src/auth/email-verification.service';
import { GoogleAuthGuard, JwtRefreshGuard } from '../src/auth/guards';
import { PermissionService } from '../src/auth/permissions';
import { CartService } from '../src/cart/cart.service';
import { WishlistService } from '../src/wishlist/wishlist.service';
import { OptionalJwtAuthGuard } from '../src/cart/guards';
import { CartIdentityInterceptor } from '../src/cart/interceptors';

/**
 * E2E for TASK-401 — what the API answers over real HTTP when the rate-limit
 * store is down.
 *
 * ## The bug this locks down (SF-CNT-19)
 *
 * On the demo stand Redis was misconfigured for the whole run. The storage
 * caught every error and returned "0 hits so far", so the API served seven
 * contact submissions against a 5/min cap and would have accepted unlimited
 * password attempts on `/auth/login`. Nothing errored, nothing alerted,
 * `/health` said `ok`: the rate limiter was OFF and every signal we had said it
 * was on.
 *
 * ## Why this suite builds its own tiny app
 *
 * What is being asserted is the guard's split — the same class production
 * registers as `APP_GUARD`, the same `@FailClosedThrottle()` decorator the real
 * routes carry, and a storage that fails the way a dead Redis fails.
 * Booting AppModule would add a database, auth and a mail outbox to a question
 * none of them participate in. WHICH real routes carry the decorator is pinned
 * separately, and without HTTP, in `src/throttler/fail-closed-routes.spec.ts` —
 * together the two cover the acceptance criteria (`POST /contact` → 503,
 * `GET /products` → 200) without either test having to boot the world.
 *
 * The probe routes below mirror the real ones one-for-one: a public write that
 * opted in, and a read that did not.
 */
@Controller()
class ProbeController {
  /** Stands in for POST /api/contact. */
  @Post('contact')
  @FailClosedThrottle()
  submit(@Body() body: unknown): { data: unknown } {
    return { data: body };
  }

  /** Stands in for GET /api/products. */
  @Get('products')
  list(): { data: [] } {
    return { data: [] };
  }
}

/** A store that fails exactly the way `RedisThrottlerStorage` fails on a dead Redis. */
const unreachableStorage: ThrottlerStorage = {
  increment: () =>
    Promise.reject(new ThrottlerStorageUnavailableError('NOAUTH Authentication required')),
};

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5 }],
      storage: unreachableStorage,
    }),
  ],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
class ProbeModule {}

describe('Rate limiting fails closed on public writes (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [ProbeModule] }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a public write with 503 and a stable error code', async () => {
    const response = await request(app.getHttpServer())
      .post('/contact')
      .send({ name: 'Ivan', message: 'Доброго дня' })
      .expect(503);

    // The code — not the wording — is what the storefront branches on. The
    // envelope's `error` field is the only extra property HttpExceptionFilter
    // forwards (see throttler.errors.ts).
    expect(response.body.error).toBe(ThrottlerErrorCode.STORAGE_UNAVAILABLE);
    expect(typeof response.body.message).toBe('string');
  });

  // The other half of the contract, and the reason this is not simply "return
  // 503 when Redis is down": a shop that stops showing products because a cache
  // container restarted has turned a degraded limiter into an outage.
  it('keeps serving reads while the store is down', async () => {
    await request(app.getHttpServer()).get('/products').expect(200).expect({ data: [] });
  });

  it('answers reads repeatedly — the failure is not counted against the client', async () => {
    await request(app.getHttpServer()).get('/products').expect(200);
    await request(app.getHttpServer()).get('/products').expect(200);
    await request(app.getHttpServer()).get('/products').expect(200);
  });
});

/**
 * TASK-606 — the guest-order token route, over real HTTP, on the REAL controller.
 *
 * `GET /api/orders/guest/:token` is the one read that opts into fail-closed: the
 * path segment is the credential, so a limiter that silently fails open turns the
 * route into an unlimited guessing oracle. A probe route would stay green with
 * the decorator deleted from `order.controller.ts`, so this block mounts the real
 * `OrderController` and stubs only what sits behind it. The service stub resolves
 * an order for ANY token — if the guard ever let a request through, the test would
 * see a 200 rather than a 503.
 *
 * `POST /api/orders/lookup` (TASK-483) rides along: it is the pattern this route
 * now follows, and it had no HTTP-level test of its own.
 */
describe('Guest order routes fail closed when the limiter is down (e2e, TASK-606)', () => {
  let app: INestApplication;
  const orderService = {
    getGuestOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
    lookupOrders: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
  };

  @Module({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [{ ttl: 60_000, limit: 5 }],
        storage: unreachableStorage,
      }),
    ],
    controllers: [OrderController],
    providers: [
      { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
      { provide: OrderService, useValue: orderService },
    ],
  })
  class RealOrderRoutesModule {}

  const passThrough = { canActivate: () => true };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [RealOrderRoutesModule] })
      // Only the authenticated / cart routes carry these; neither route under
      // test does. Overriding them keeps JWT and config out of a limiter test.
      .overrideGuard(JwtAuthGuard)
      .useValue(passThrough)
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue(passThrough)
      .overrideInterceptor(CartIdentityInterceptor)
      .useValue({ intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle() })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    orderService.getGuestOrder.mockClear();
    orderService.lookupOrders.mockClear();
  });

  it('GET /orders/guest/:token answers 503, never the order', async () => {
    const response = await request(app.getHttpServer())
      .get('/orders/guest/any-guess-at-all')
      .expect(503);

    expect(response.body.error).toBe(ThrottlerErrorCode.STORAGE_UNAVAILABLE);
    expect(orderService.getGuestOrder).not.toHaveBeenCalled();
  });

  it('keeps refusing repeated guesses — no request slips through uncounted', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get(`/orders/guest/guess-${i}`).expect(503);
    }
    expect(orderService.getGuestOrder).not.toHaveBeenCalled();
  });

  it('POST /orders/lookup answers 503 as well', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders/lookup')
      .send({ orderNumber: 'ABCD1234', phone: '+380501234567' })
      .expect(503);

    expect(response.body.error).toBe(ThrottlerErrorCode.STORAGE_UNAVAILABLE);
    expect(orderService.lookupOrders).not.toHaveBeenCalled();
  });
});

/**
 * TASK-493 — `POST /api/auth/password-reset/confirm` over real HTTP, on the REAL
 * `AuthController`.
 *
 * Fail-closed here is for uniformity (owner decision B-11), not brute force: the
 * token is 256-bit. The route still has to answer 503 when the limiter is down,
 * and a probe would stay green with the decorator deleted from the controller,
 * so the real class is mounted and only its collaborators are stubbed. The
 * service stub would succeed for ANY token — a 200 would mean the guard let the
 * request through.
 *
 * `POST /api/auth/email/verify/confirm` rides along (it was already fail-closed,
 * without an HTTP-level test), and `POST /api/auth/refresh` pins the named
 * exception from the other side: it must NOT be refused for a limiter outage.
 */
describe('Auth token-confirm routes fail closed when the limiter is down (e2e, TASK-493)', () => {
  let app: INestApplication;
  const authService = {
    confirmPasswordReset: jest.fn().mockResolvedValue(undefined),
    refreshToken: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
  };
  const emailVerificationService = {
    confirm: jest.fn().mockResolvedValue({ claimedOrders: 0 }),
  };

  @Module({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [{ ttl: 60_000, limit: 5 }],
        storage: unreachableStorage,
      }),
    ],
    controllers: [AuthController],
    providers: [
      { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
      { provide: AuthService, useValue: authService },
      { provide: EmailVerificationService, useValue: emailVerificationService },
      { provide: ConfigService, useValue: { get: (_key: string, fallback?: unknown) => fallback } },
      { provide: JwtService, useValue: {} },
      { provide: CartService, useValue: {} },
      { provide: WishlistService, useValue: {} },
      { provide: PermissionService, useValue: {} },
    ],
  })
  class RealAuthRoutesModule {}

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [RealAuthRoutesModule] })
      // The refresh guard normally validates the cookie through passport; here it
      // just hands the handler a user so the named exception can be exercised.
      .overrideGuard(JwtRefreshGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<{ user: unknown }>().user = {
            id: 'user-1',
            refreshToken: 'raw',
          };
          return true;
        },
      })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(GoogleAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    authService.confirmPasswordReset.mockClear();
    authService.refreshToken.mockClear();
    emailVerificationService.confirm.mockClear();
  });

  it('POST /auth/password-reset/confirm answers 503 and never resets the password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({ token: 'a'.repeat(64), newPassword: 'N3w-Passw0rd!' })
      .expect(503);

    expect(response.body.error).toBe(ThrottlerErrorCode.STORAGE_UNAVAILABLE);
    expect(authService.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('POST /auth/email/verify/confirm answers 503 as well', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/email/verify/confirm')
      .send({ token: 'b'.repeat(64) })
      .expect(503);

    expect(response.body.error).toBe(ThrottlerErrorCode.STORAGE_UNAVAILABLE);
    expect(emailVerificationService.confirm).not.toHaveBeenCalled();
  });

  it('POST /auth/refresh — the named exception — keeps working', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').expect(200);
    expect(authService.refreshToken).toHaveBeenCalledWith('raw');
  });
});
