import { ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { buildCacheOptions } from './cache.module';

// Mock the ioredis-backed store factory so the test never opens a real
// connection; we only assert HOW it is configured.
jest.mock('cache-manager-ioredis-yet', () => ({
  redisStore: jest.fn().mockResolvedValue({ name: 'redis' }),
}));

const redisStoreMock = redisStore as jest.MockedFunction<typeof redisStore>;

/** A ConfigService stub backed by a plain values map. */
function configWith(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('buildCacheOptions', () => {
  beforeEach(() => {
    redisStoreMock.mockClear();
  });

  it('configures ioredis to fail fast when REDIS_HOST is set', async () => {
    await buildCacheOptions(configWith({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 }));

    expect(redisStoreMock).toHaveBeenCalledTimes(1);
    const options = redisStoreMock.mock.calls[0][0];

    // The regression we guard against: without these, a cache GET blocks ~1 min
    // before erroring while Redis is down, instead of falling through to the DB
    // immediately. enableOfflineQueue:false is the load-bearing one.
    expect(options).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 1000,
    });
    expect(typeof options?.retryStrategy).toBe('function');
  });

  it('does not build a Redis store when REDIS_HOST is absent (in-memory fallback)', async () => {
    const result = await buildCacheOptions(configWith({ REDIS_CACHE_TTL_SECONDS: 60 }));

    expect(redisStoreMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ttl: 60_000 });
  });
});
