import type Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage';
import type { ThrottlerRedisHealth } from './throttler-redis-health';
import { ThrottlerStorageUnavailableError } from './throttler.errors';

function makeHealth() {
  return {
    markReachable: jest.fn(),
    markUnreachable: jest.fn(),
    markDisabled: jest.fn(),
  } as unknown as ThrottlerRedisHealth & {
    markReachable: jest.Mock;
    markUnreachable: jest.Mock;
  };
}

function makeRedis(evalImpl: jest.Mock) {
  return { eval: evalImpl } as unknown as Redis;
}

describe('RedisThrottlerStorage', () => {
  const health = makeHealth();
  const build = (evalImpl: jest.Mock) => new RedisThrottlerStorage(makeRedis(evalImpl), health);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps a sub-limit reply to a non-blocked record (ms → seconds)', async () => {
    const storage = build(jest.fn().mockResolvedValue([3, 45000, 0, 0]));

    const record = await storage.increment('1.2.3.4', 60000, 100, 60000, 'default');

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('maps an over-limit reply to a blocked record', async () => {
    const storage = build(jest.fn().mockResolvedValue([6, 30000, 1, 60000]));

    const record = await storage.increment('1.2.3.4', 60000, 5, 60000, 'default');

    expect(record).toEqual({
      totalHits: 6,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('passes namespaced hit + block keys to the Lua script', async () => {
    const evalMock = jest.fn().mockResolvedValue([1, 60000, 0, 0]);
    const storage = build(evalMock);

    await storage.increment('abc', 60000, 100, 60000, 'default');

    const args = evalMock.mock.calls[0];
    // eval(script, numKeys, hitKey, blockKey, ...argv)
    expect(args[1]).toBe(2);
    expect(args[2]).toBe('default:abc');
    expect(args[3]).toBe('default:abc:block');
  });

  // ─── Redis down (TASK-401) ─────────────────────────────────────────────────
  //
  // This spec used to read `fails open (allows the request) when Redis throws`
  // and asserted `totalHits: 0`. That was the demo-stand defect written down as
  // a guarantee: a wrong REDIS_PASSWORD turned every limit — /auth/login
  // included — into "no limit", and the API answered as if nothing had happened.
  // The storage no longer decides; it reports, and the guard chooses per route.

  describe('when Redis is unreachable', () => {
    it('raises ThrottlerStorageUnavailableError instead of inventing a zero count', async () => {
      const storage = build(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await expect(storage.increment('1.2.3.4', 60000, 5, 60000, 'default')).rejects.toBeInstanceOf(
        ThrottlerStorageUnavailableError,
      );
    });

    it('carries the underlying reason so the log names the real cause', async () => {
      const storage = build(
        jest.fn().mockRejectedValue(new Error('NOAUTH Authentication required')),
      );

      await expect(storage.increment('1.2.3.4', 60000, 5, 60000, 'default')).rejects.toThrow(
        /NOAUTH Authentication required/,
      );
    });

    it('records the outage so /health and the logs stop reporting a healthy limiter', async () => {
      const storage = build(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await expect(storage.increment('1.2.3.4', 60000, 5, 60000, 'default')).rejects.toBeInstanceOf(
        ThrottlerStorageUnavailableError,
      );

      expect(health.markUnreachable).toHaveBeenCalledWith('ECONNREFUSED');
      expect(health.markReachable).not.toHaveBeenCalled();
    });

    it('records recovery on the next counter that succeeds', async () => {
      const storage = build(jest.fn().mockResolvedValue([1, 60000, 0, 0]));

      await storage.increment('1.2.3.4', 60000, 5, 60000, 'default');

      expect(health.markReachable).toHaveBeenCalledTimes(1);
      expect(health.markUnreachable).not.toHaveBeenCalled();
    });
  });

  // ─── Shutdown (TASK-296) ───────────────────────────────────────────────────

  describe('onModuleDestroy', () => {
    it('quits the connection so it does not outlive the app', async () => {
      const quit = jest.fn().mockResolvedValue('OK');
      const disconnect = jest.fn();
      const storage = new RedisThrottlerStorage(
        { quit, disconnect } as unknown as Redis,
        makeHealth(),
      );

      await storage.onModuleDestroy();

      expect(quit).toHaveBeenCalledTimes(1);
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('falls back to disconnect when quit throws (never-connected client)', async () => {
      const quit = jest.fn().mockRejectedValue(new Error('Connection is closed.'));
      const disconnect = jest.fn();
      const storage = new RedisThrottlerStorage(
        { quit, disconnect } as unknown as Redis,
        makeHealth(),
      );

      await expect(storage.onModuleDestroy()).resolves.toBeUndefined();

      expect(disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
