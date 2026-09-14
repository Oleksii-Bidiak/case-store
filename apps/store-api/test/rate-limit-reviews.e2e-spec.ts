import { Test } from '@nestjs/testing';
import { Controller, HttpCode, HttpStatus, Module, Post, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ClientIpThrottlerGuard, ReviewSubmissionThrottle } from '../src/throttler';
import { buildThrottlerOptions } from '../src/throttler/throttler.config';
import type { ThrottlerRedisHealth } from '../src/throttler/throttler-redis-health';
import { applyProxyTrust } from '../src/config/trust-proxy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { JwtAccessStrategy } from '../src/auth/strategies/jwt-access.strategy';

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
 * in the database for no benefit. Everything that decides the outcome is real —
 * the options come from `buildThrottlerOptions`, the global guard is
 * {@link ClientIpThrottlerGuard}, and the route carries the real
 * {@link JwtAuthGuard} over the real access-token strategy.
 *
 * ## Why the authenticated user is NOT faked any more (TASK-598)
 *
 * It used to be, by an express middleware that set `req.user` from a header
 * "the way JwtAuthGuard would". Middleware runs before every guard; `JwtAuthGuard`
 * runs after the global throttler. So the fake produced the one request shape
 * production never makes, and the suite stayed green for a month while both
 * buckets keyed on the address: an office shared five an hour between everyone in
 * it, and one account got a fresh five by changing networks. A test that supplies
 * the author by any route other than the Authorization header cannot see that,
 * so this one signs real tokens.
 */
@Controller('probe')
class ProbeController {
  /** Stands in for `POST /api/products/:productId/reviews`, guard order included. */
  @Post('review')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
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

/** The secret both the strategy and the throttler's tracker are handed. */
const JWT_SECRET = 'rate-limit-reviews-e2e-secret';

/** No REDIS_HOST → the in-memory counter store, which is what e2e wants anyway. */
const configStub = {
  get: (key: string, fallback?: unknown) => (key === 'REDIS_HOST' ? undefined : fallback),
  getOrThrow: (key: string) => {
    if (key === 'JWT_SECRET') {
      return JWT_SECRET;
    }
    throw new Error(`Unexpected getOrThrow(${key})`);
  },
} as unknown as ConfigService;

const jwt = new JwtService({ secret: JWT_SECRET });
/** An access token shaped exactly like the one `AuthService` issues. */
const tokenFor = (sub: string) => jwt.sign({ sub, role: 'CUSTOMER' }, { secret: JWT_SECRET });

describe('Review submission rate limits (e2e, TASK-588)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const options = await buildThrottlerOptions(configStub, healthStub);

    @Module({
      imports: [ThrottlerModule.forRoot(options), PassportModule],
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
        { provide: ConfigService, useValue: configStub },
        JwtAccessStrategy,
      ],
    })
    class ProbeModule {}

    const moduleFixture = await Test.createTestingModule({ imports: [ProbeModule] }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    applyProxyTrust(app);
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
      .set('Authorization', `Bearer ${tokenFor(user)}`);

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

  it('leaves every other route alone — past BOTH caps, not just the hourly one', async () => {
    // A named throttler applies to EVERY route unless it opts out. Without the
    // opt-in gate, the sixth request here would 429 and the storefront would be
    // capped at five requests an hour.
    //
    // The loop runs past TWENTY deliberately (TASK-598): at eight it cleared the
    // account bucket's five and stopped well short of the address bucket's twenty,
    // so a `skipIf` lost from `reviewsIp` alone — which would cap the entire
    // storefront at twenty requests a DAY — left this test green.
    const ip = '203.0.113.30';

    for (let i = 0; i < 22; i += 1) {
      await post('other', ip, 'author-c').expect(200);
    }
  });

  it('counts the ACCOUNT from the token, which is the only place it can come from', async () => {
    // The regression test for TASK-598 proper. `req.user` does not exist when the
    // throttler runs — the global guard is ahead of the route's JwtAuthGuard — so
    // if the tracker ever goes back to reading it, both buckets key on the address
    // and this fails on the second account rather than the sixth request.
    const ip = '203.0.113.40';

    for (let i = 0; i < 5; i += 1) {
      await post('review', ip, 'office-worker-1').expect(201);
    }
    await post('review', ip, 'office-worker-1').expect(429);

    // The colleague at the next desk — same address, different account — is not
    // out of quota, and must not be told that they are.
    await post('review', ip, 'office-worker-2').expect(201);
  });

  it('refuses an unauthenticated submission without spending anybody’s account quota', async () => {
    // The throttler runs before auth, so this request is counted before it is
    // rejected; what matters is that it lands in the ADDRESS bucket and not in
    // some shared account one.
    const ip = '203.0.113.50';

    await request(app.getHttpServer()).post('/probe/review').set('X-Forwarded-For', ip).expect(401);

    // A real account from that same address still has its whole five.
    for (let i = 0; i < 5; i += 1) {
      await post('review', ip, 'late-arrival').expect(201);
    }
  });
});
