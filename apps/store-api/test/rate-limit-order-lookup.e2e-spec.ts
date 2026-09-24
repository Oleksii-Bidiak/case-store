import { Test } from '@nestjs/testing';
import { Logger, Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ClientIpThrottlerGuard } from '../src/throttler';
import { buildThrottlerOptions } from '../src/throttler/throttler.config';
import type { ThrottlerRedisHealth } from '../src/throttler/throttler-redis-health';
import { applyProxyTrust } from '../src/config/trust-proxy';
import { OrderController } from '../src/order/order.controller';
import { OrderService } from '../src/order/order.service';
import { JwtAuthGuard } from '../src/auth';
import { OptionalJwtAuthGuard } from '../src/cart/guards';
import { CartIdentityInterceptor } from '../src/cart/interceptors';

/**
 * E2E for TASK-624 — `POST /api/orders/lookup` is capped per ORDER NUMBER, not
 * only per address.
 *
 * ## What was missing
 *
 * The route had one limiter: five a minute per IP. That stops one client and is
 * blind to a guess spread over many — someone holding an order number from a
 * waybill, walking phone numbers against it from a botnet. Nothing locked the
 * target out, nothing logged it, and `order.lookup_miss` is deliberately written
 * without the number, so there was nothing to correlate afterwards.
 *
 * ## Why the real controller, and the real options
 *
 * The bucket is opted into by a decorator on `OrderController.lookupOrder`; a
 * probe route would stay green with that decorator deleted. The options come
 * from `buildThrottlerOptions`, the guard is the production
 * {@link ClientIpThrottlerGuard}, and `trust proxy` is applied the way `main.ts`
 * applies it — so rotating `X-Forwarded-For` really does look like rotating
 * clients, which is the attack being modelled. Only the service behind the route
 * and the unrelated auth/cart guards are stubbed.
 */

const healthStub = {
  markDisabled: jest.fn(),
  markReachable: jest.fn(),
  markUnreachable: jest.fn(),
} as unknown as ThrottlerRedisHealth;

/** No REDIS_HOST → the in-memory counter store. */
const configStub = {
  get: (key: string, fallback?: unknown) => (key === 'REDIS_HOST' ? undefined : fallback),
  getOrThrow: (key: string) => {
    if (key === 'JWT_SECRET') {
      return 'rate-limit-order-lookup-e2e-secret';
    }
    throw new Error(`Unexpected getOrThrow(${key})`);
  },
} as unknown as ConfigService;

describe('Order lookup is rate-limited per order number (e2e, TASK-624)', () => {
  let app: NestExpressApplication;
  let warn: jest.SpyInstance;

  const orderService = {
    lookupOrders: jest.fn().mockResolvedValue([]),
    getGuestOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
  };

  beforeAll(async () => {
    const options = await buildThrottlerOptions(configStub, healthStub);

    @Module({
      imports: [ThrottlerModule.forRoot(options)],
      controllers: [OrderController],
      providers: [
        { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
        { provide: OrderService, useValue: orderService },
      ],
    })
    class LookupModule {}

    const passThrough = { canActivate: () => true };
    const moduleFixture = await Test.createTestingModule({ imports: [LookupModule] })
      // Neither route under test carries these; overriding them keeps JWT and
      // the cart cookie out of a limiter test.
      .overrideGuard(JwtAuthGuard)
      .useValue(passThrough)
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue(passThrough)
      .overrideInterceptor(CartIdentityInterceptor)
      .useValue({ intercept: (_ctx: unknown, next: { handle: () => unknown }) => next.handle() })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    applyProxyTrust(app);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    orderService.lookupOrders.mockClear();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  /** Supertest talks over loopback, so Caddy's appended real peer is simulated. */
  const lookup = (number: string, ip: string, phone = '+380501112233') =>
    request(app.getHttpServer())
      .post('/orders/lookup')
      .set('X-Forwarded-For', ip)
      .send({ number, phone });

  it('locks one order number out after ten lookups, however many addresses ask', async () => {
    // Ten different clients, one request each: the per-IP cap never comes close.
    // The spelling rotates too — the guard runs before the DTO's transform, so
    // this is what proves the bucket normalises the number itself.
    const spellings = ['a1b2c3d4', '#A1B2C3D4', 'a1b2 c3d4', '№A1B2C3D4'];
    for (let i = 0; i < 10; i += 1) {
      await lookup(spellings[i % spellings.length], `198.51.100.${i + 1}`).expect(200);
    }

    // The eleventh, from an address that has never been seen before.
    await lookup('a1b2c3d4', '198.51.100.200').expect(429);
    expect(orderService.lookupOrders).toHaveBeenCalledTimes(10);

    // …and the refusal is written down, correlatable but without the number.
    const lockouts = warn.mock.calls.filter(
      ([fields]) => (fields as { event?: string }).event === 'order.lookup_throttled',
    );
    expect(lockouts).toHaveLength(1);
    const fields = lockouts[0][0] as { target: string };
    expect(fields.target).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(lockouts[0])).not.toMatch(/a1b2c3d4/i);
  });

  it('locks out the TARGET only — another order from that same address is fine', async () => {
    for (let i = 0; i < 10; i += 1) {
      await lookup('b1b2c3d4', `203.0.113.${i + 1}`).expect(200);
    }
    await lookup('b1b2c3d4', '203.0.113.250').expect(429);

    await lookup('c1c2c3d4', '203.0.113.250').expect(200);
  });

  it('keeps the per-IP cap: one address trying many numbers still runs out', async () => {
    // Five a minute per address, each on a different order — every per-number
    // bucket is fresh, so only the per-IP one can refuse the sixth.
    const ip = '192.0.2.10';
    for (let i = 0; i < 5; i += 1) {
      await lookup(`d000000${i}`, ip).expect(200);
    }
    await lookup('d0000005', ip).expect(429);
  });

  it('leaves other routes alone — ten an hour must not leak onto them', async () => {
    // A named throttler runs on every route unless it opts out. Twelve reads
    // from one address sit under the guest route's own 20/min and above ten.
    const ip = '192.0.2.20';
    for (let i = 0; i < 12; i += 1) {
      await request(app.getHttpServer())
        .get(`/orders/guest/token-${i}`)
        .set('X-Forwarded-For', ip)
        .expect(200);
    }
  });
});
