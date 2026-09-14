import { Test } from '@nestjs/testing';
import { Controller, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { ClientIpThrottlerGuard, ReviewSubmissionThrottle } from '../src/throttler';
import { buildThrottlerOptions } from '../src/throttler/throttler.config';
import type { ThrottlerRedisHealth } from '../src/throttler/throttler-redis-health';
import { applyProxyTrust } from '../src/config/trust-proxy';

/**
 * E2E for TASK-588 — the two review-submission buckets, end to end.
 *
 * ## What is actually at stake
 *
 * The owner's decision 7 asks for TWO caps on submitting a rating: five an hour
 * per ACCOUNT, twenty a day per ADDRESS. They are not interchangeable and must
 * not share a counter — TASK-386 shipped a single shared rate-limit bucket to
 * production and nobody noticed until a load test found it, because a wrong
 * limiter looks exactly like a working one until the moment it matters.
 *
 * Three properties can only be seen from outside, which is why this is an e2e:
 *  1. an account spends its own quota and nobody else's;
 *  2. an address runs out even when every request comes from a different, fresh
 *     account — i.e. the two counters are genuinely separate keys;
 *  3. NO OTHER ROUTE is affected. This is the one that would have bitten:
 *     @nestjs/throttler runs every configured throttler against every route, so
 *     naming a five-an-hour bucket and stopping there would cap the entire
 *     storefront at five requests an hour.
 *
 * ## Why it builds its own tiny app
 *
 * Same reason as `rate-limit-client-ip.e2e-spec.ts`: booting AppModule would drag
 * in the database and auth for no benefit. The throttler options come from the
 * REAL `buildThrottlerOptions`, and the guard is the real
 * {@link ClientIpThrottlerGuard}, so this cannot pass against a configuration
 * production does not have. Only the authenticated user is faked, by a middleware
 * that sets `req.user` from a header the way `JwtAuthGuard` would.
 */
@Controller('probe')
class ProbeController {
  /** Stands in for `POST /api/products/:productId/reviews`. */
  @Post('review')
  @HttpCode(HttpStatus.CREATED)
  @ReviewSubmissionThrottle()
  submit(): { ok: true } {
    return { ok: true };
  }

  /** Any other route in the app — must keep the global limit and nothing else. */
  @Post('other')
  @HttpCode(HttpStatus.OK)
  other(): { ok: true } {
    return { ok: true };
  }
}

const healthStub = {
  markDisabled: jest.fn(),
  markReachable: jest.fn(),
  markUnreachable: jest.fn(),
} as unknown as ThrottlerRedisHealth;

/** No REDIS_HOST → the in-memory counter store, which is what e2e wants anyway. */
const configStub = {
  get: (key: string, fallback?: unknown) => (key === 'REDIS_HOST' ? undefined : fallback),
} as unknown as ConfigService;

describe('Review submission rate limits (e2e, TASK-588)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const options = await buildThrottlerOptions(configStub, healthStub);

    @Module({
      imports: [ThrottlerModule.forRoot(options)],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
    })
    class ProbeModule {}

    const moduleFixture = await Test.createTestingModule({ imports: [ProbeModule] }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    applyProxyTrust(app);
    // Stands in for JwtAuthGuard: whatever `x-test-user` says is the author.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.headers['x-test-user'];
      if (typeof id === 'string') {
        (req as Request & { user?: { id: string } }).user = { id };
      }
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Supertest talks over loopback, so Caddy's appended real peer is simulated. */
  const post = (path: string, ip: string, user: string) =>
    request(app.getHttpServer())
      .post(`/probe/${path}`)
      .set('X-Forwarded-For', ip)
      .set('x-test-user', user);

  it('spends one author’s five an hour without touching another’s', async () => {
    const ip = '203.0.113.10';

    for (let i = 0; i < 5; i += 1) {
      await post('review', ip, 'author-a').expect(201);
    }
    await post('review', ip, 'author-a').expect(429);

    // A different account on the SAME address still has its own five. If the two
    // buckets had been folded into one cap, this is the request that would fail.
    await post('review', ip, 'author-b').expect(201);
  });

  it('runs an address out of quota even when every request is a fresh account', async () => {
    const ip = '203.0.113.20';

    // Four accounts × five each = the address's twenty for the day, with every
    // account still inside its own hourly five.
    for (const author of ['b-1', 'b-2', 'b-3', 'b-4']) {
      for (let i = 0; i < 5; i += 1) {
        await post('review', ip, author).expect(201);
      }
    }

    // A fifth account that has submitted nothing at all: its account bucket is
    // empty, so only the ADDRESS bucket can refuse this — which is the proof that
    // the two are separate keys rather than one counter wearing two names.
    await post('review', ip, 'b-5').expect(429);

    // …and the same fresh account from a different address is fine.
    await post('review', '203.0.113.21', 'b-5').expect(201);
  });

  it('leaves every other route alone', async () => {
    // A named throttler applies to EVERY route unless it opts out. Without the
    // opt-in gate, the sixth request here would 429 and the storefront would be
    // capped at five requests an hour.
    const ip = '203.0.113.30';

    for (let i = 0; i < 8; i += 1) {
      await post('other', ip, 'author-c').expect(200);
    }
  });
});
