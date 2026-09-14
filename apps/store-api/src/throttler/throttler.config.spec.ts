import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions, ThrottlerOptions } from '@nestjs/throttler';
import {
  buildThrottlerOptions,
  trackReviewAuthor,
  verifyThrottlerRedis,
  type PingableRedis,
} from './throttler.config';
import { REVIEW_SUBMISSION_THROTTLE_KEY } from './review-submission-throttle.decorator';
import type { ThrottlerRedisHealth } from './throttler-redis-health';

/** `trackReviewAuthor` never reads the context; one stub serves every case. */
const ctx = (): ExecutionContext => ({}) as ExecutionContext;

function makeHealth() {
  return {
    markDisabled: jest.fn(),
    markReachable: jest.fn(),
    markUnreachable: jest.fn(),
  } as unknown as ThrottlerRedisHealth & {
    markDisabled: jest.Mock;
    markReachable: jest.Mock;
    markUnreachable: jest.Mock;
  };
}

const reachable = (): PingableRedis => ({
  connect: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
});

const refusing = (message = 'connect ECONNREFUSED 10.0.0.5:6379'): PingableRedis => ({
  connect: jest.fn().mockRejectedValue(new Error(message)),
  ping: jest.fn(),
});

/**
 * TASK-401 — the boot-time PING.
 *
 * Before this, the throttler's Redis client was lazy: it first tried to speak to
 * Redis from inside a request, where the failure was swallowed. A wrong
 * `REDIS_PASSWORD` on the demo stand therefore produced one `warn` line and a
 * completely unprotected API, and every other signal — `/health`, the container
 * status, the dashboards — stayed green for the whole run.
 */
describe('verifyThrottlerRedis', () => {
  it('marks the store reachable when Redis answers PING', async () => {
    const health = makeHealth();
    const redis = reachable();

    await verifyThrottlerRedis(redis, { health, target: 'redis:6379', isProduction: false });

    expect(redis.connect).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
    expect(health.markReachable).toHaveBeenCalledTimes(1);
    expect(health.markUnreachable).not.toHaveBeenCalled();
  });

  // Outside production a developer without Redis running must still get a
  // working app — the in-memory limits keep counting, and the error line says so.
  it('records the failure but still boots outside production', async () => {
    const health = makeHealth();

    await expect(
      verifyThrottlerRedis(refusing(), { health, target: 'redis:6379', isProduction: false }),
    ).resolves.toBeUndefined();

    expect(health.markUnreachable).toHaveBeenCalledWith('connect ECONNREFUSED 10.0.0.5:6379');
  });

  // In production this is a failed deploy, not a warning: an API that cannot
  // enforce its auth limits is not ready for traffic, and a restart loop is
  // visible where a log line demonstrably was not.
  it('refuses to start in production, naming the target and the reason', async () => {
    const health = makeHealth();

    await expect(
      verifyThrottlerRedis(refusing('NOAUTH Authentication required'), {
        health,
        target: 'redis:6379',
        isProduction: true,
      }),
    ).rejects.toThrow(/redis:6379.*NOAUTH Authentication required/s);

    expect(health.markUnreachable).toHaveBeenCalledWith('NOAUTH Authentication required');
  });

  it('treats a PING that fails after a successful connect as unreachable', async () => {
    const health = makeHealth();
    const redis: PingableRedis = {
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockRejectedValue(new Error('READONLY')),
    };

    await verifyThrottlerRedis(redis, { health, target: 'redis:6379', isProduction: false });

    expect(health.markUnreachable).toHaveBeenCalledWith('READONLY');
    expect(health.markReachable).not.toHaveBeenCalled();
  });
});

const configWithout = (): ConfigService =>
  ({
    get: (key: string, fallback?: unknown) => (key === 'REDIS_HOST' ? undefined : fallback),
  }) as unknown as ConfigService;

describe('buildThrottlerOptions without REDIS_HOST', () => {
  it('uses the in-memory store and does not report a degraded limiter', async () => {
    const health = makeHealth();

    const options = await buildThrottlerOptions(configWithout(), health);

    expect(namedThrottlers(options).default).toMatchObject({ ttl: 60000, limit: 100 });
    expect(health.markDisabled).toHaveBeenCalledTimes(1);
    expect(health.markUnreachable).not.toHaveBeenCalled();
  });
});

// ─── TASK-588: the two review-submission buckets ─────────────────────────────

/** The configured throttlers keyed by name — `default` for the unnamed one. */
function namedThrottlers(options: ThrottlerModuleOptions): Record<string, ThrottlerOptions> {
  const list = Array.isArray(options) ? options : options.throttlers;
  return Object.fromEntries(list.map((entry) => [entry.name ?? 'default', entry]));
}

/** A minimal ExecutionContext — `skipIf` only ever asks it for the two targets. */
const contextFor = (handler: object, cls: object = class {}): ExecutionContext =>
  ({ getHandler: () => handler, getClass: () => cls }) as unknown as ExecutionContext;

describe('review submission is capped per ACCOUNT and per ADDRESS (TASK-588)', () => {
  let options: ThrottlerModuleOptions;

  beforeEach(async () => {
    options = await buildThrottlerOptions(configWithout(), makeHealth());
  });

  it('registers two SEPARATE named buckets, not one combined cap', async () => {
    // The owner's decision 7: an account limit and an address limit answer
    // different questions, and TASK-386 is on record for what a single shared
    // bucket costs. Two NAMES mean two keys — the guard folds the throttler name
    // into `generateKey` — so neither can spend the other's quota.
    const throttlers = namedThrottlers(options);

    expect(Object.keys(throttlers).sort()).toEqual(['default', 'reviewsAccount', 'reviewsIp']);
    expect(throttlers.reviewsAccount).toMatchObject({ limit: 5, ttl: 60 * 60 * 1000 });
    expect(throttlers.reviewsIp).toMatchObject({ limit: 20, ttl: 24 * 60 * 60 * 1000 });
  });

  it('tracks the account bucket by the author and leaves the address bucket per IP', () => {
    const throttlers = namedThrottlers(options);

    // Its own tracker, which the guard resolves AHEAD of
    // `ClientIpThrottlerGuard.getTracker`.
    expect(typeof throttlers.reviewsAccount.getTracker).toBe('function');
    // And none of its own, so it inherits the guard's per-IP tracker. Giving it
    // one here would quietly make both buckets count the same thing.
    expect(throttlers.reviewsIp.getTracker).toBeUndefined();
  });

  it('applies ONLY to routes that opt in — a named throttler otherwise runs on every route', () => {
    // The trap: @nestjs/throttler applies EVERY configured throttler to EVERY
    // route unless it is skipped. Registered without this, `reviewsAccount` would
    // cap the whole storefront at five requests an hour — catalogue reads
    // included — and the first sign of it would be a shop that 429s after five
    // clicks.
    const throttlers = namedThrottlers(options);
    const plain = () => undefined;
    const optedIn = () => undefined;
    Reflect.defineMetadata(REVIEW_SUBMISSION_THROTTLE_KEY, true, optedIn);

    for (const name of ['reviewsAccount', 'reviewsIp']) {
      expect(throttlers[name].skipIf?.(contextFor(plain))).toBe(true);
      expect(throttlers[name].skipIf?.(contextFor(optedIn))).toBe(false);
    }

    // The global default keeps covering everything, opted in or not.
    expect(throttlers.default.skipIf).toBeUndefined();
  });
});

describe('trackReviewAuthor (TASK-588)', () => {
  it('counts the authenticated author, so a fresh address buys no fresh quota', async () => {
    await expect(
      trackReviewAuthor({ user: { id: 'author-1' }, ip: '203.0.113.7' }, ctx()),
    ).resolves.toBe('user:author-1');
    // Same author, different address — still one bucket.
    await expect(
      trackReviewAuthor({ user: { id: 'author-1' }, ip: '198.51.100.4' }, ctx()),
    ).resolves.toBe('user:author-1');
  });

  it('never collapses two authors into one tracker', async () => {
    const first = await trackReviewAuthor({ user: { id: 'author-1' } }, ctx());
    const second = await trackReviewAuthor({ user: { id: 'author-2' } }, ctx());

    expect(first).not.toBe(second);
  });

  it('falls back to the address when there is somehow no author — never to a constant', async () => {
    // The route sits behind JwtAuthGuard, so this should not happen. If it ever
    // does, a constant would put EVERY submitter into one five-an-hour bucket:
    // the shared-bucket bug of TASK-386, reintroduced at the single route this
    // task exists to protect. Degrading to per-IP keeps the cap honest.
    const alice = await trackReviewAuthor({ ip: '203.0.113.7' }, ctx());
    const bob = await trackReviewAuthor({ socket: { remoteAddress: '198.51.100.4' } }, ctx());

    expect(alice).toBe('ip:203.0.113.7');
    expect(bob).toBe('ip:198.51.100.4');
    expect(alice).not.toBe(bob);
  });

  it('refuses to invent a tracker when neither an author nor an address is known', async () => {
    await expect(trackReviewAuthor({}, ctx())).rejects.toThrow(/tracker/i);
  });
});
