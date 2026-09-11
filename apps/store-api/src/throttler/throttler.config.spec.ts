import type { ConfigService } from '@nestjs/config';
import {
  buildThrottlerOptions,
  verifyThrottlerRedis,
  type PingableRedis,
} from './throttler.config';
import type { ThrottlerRedisHealth } from './throttler-redis-health';

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

describe('buildThrottlerOptions without REDIS_HOST', () => {
  const configWithout = (): ConfigService =>
    ({
      get: (key: string, fallback?: unknown) => (key === 'REDIS_HOST' ? undefined : fallback),
    }) as unknown as ConfigService;

  it('uses the in-memory store and does not report a degraded limiter', async () => {
    const health = makeHealth();

    const options = await buildThrottlerOptions(configWithout(), health);

    expect(options).toEqual({ throttlers: [{ ttl: 60000, limit: 100 }] });
    expect(health.markDisabled).toHaveBeenCalledTimes(1);
    expect(health.markUnreachable).not.toHaveBeenCalled();
  });
});
