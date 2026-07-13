import type Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage';

function makeRedis(evalImpl: jest.Mock) {
  return { eval: evalImpl } as unknown as Redis;
}

describe('RedisThrottlerStorage', () => {
  it('maps a sub-limit reply to a non-blocked record (ms → seconds)', async () => {
    const evalMock = jest.fn().mockResolvedValue([3, 45000, 0, 0]);
    const storage = new RedisThrottlerStorage(makeRedis(evalMock));

    const record = await storage.increment('1.2.3.4', 60000, 100, 60000, 'default');

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('maps an over-limit reply to a blocked record', async () => {
    const evalMock = jest.fn().mockResolvedValue([6, 30000, 1, 60000]);
    const storage = new RedisThrottlerStorage(makeRedis(evalMock));

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
    const storage = new RedisThrottlerStorage(makeRedis(evalMock));

    await storage.increment('abc', 60000, 100, 60000, 'default');

    const args = evalMock.mock.calls[0];
    // eval(script, numKeys, hitKey, blockKey, ...argv)
    expect(args[1]).toBe(2);
    expect(args[2]).toBe('default:abc');
    expect(args[3]).toBe('default:abc:block');
  });

  it('fails open (allows the request) when Redis throws', async () => {
    const evalMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const storage = new RedisThrottlerStorage(makeRedis(evalMock));

    const record = await storage.increment('1.2.3.4', 60000, 5, 60000, 'default');

    expect(record.isBlocked).toBe(false);
    expect(record.totalHits).toBe(0);
    expect(record.timeToExpire).toBe(60);
  });

  // ─── Shutdown (TASK-296) ───────────────────────────────────────────────────

  describe('onModuleDestroy', () => {
    it('quits the connection so it does not outlive the app', async () => {
      const quit = jest.fn().mockResolvedValue('OK');
      const disconnect = jest.fn();
      const storage = new RedisThrottlerStorage({ quit, disconnect } as unknown as Redis);

      await storage.onModuleDestroy();

      expect(quit).toHaveBeenCalledTimes(1);
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('falls back to disconnect when quit throws (never-connected client)', async () => {
      const quit = jest.fn().mockRejectedValue(new Error('Connection is closed.'));
      const disconnect = jest.fn();
      const storage = new RedisThrottlerStorage({ quit, disconnect } as unknown as Redis);

      await expect(storage.onModuleDestroy()).resolves.toBeUndefined();

      expect(disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
