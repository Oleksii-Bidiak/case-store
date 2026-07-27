import { ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';
import { buildCacheOptions } from './cache.module';

// Mock the Keyv/Redis store factory so the test never opens a real connection;
// we only assert HOW it is configured.
jest.mock('@keyv/redis', () => ({
  createKeyv: jest.fn().mockReturnValue({ name: 'keyv-redis' }),
}));

const createKeyvMock = createKeyv as jest.MockedFunction<typeof createKeyv>;

/** A ConfigService stub backed by a plain values map. */
function configWith(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('buildCacheOptions', () => {
  beforeEach(() => {
    createKeyvMock.mockClear();
  });

  it('configures the Redis client to fail fast when REDIS_HOST is set', async () => {
    await buildCacheOptions(configWith({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 }));

    expect(createKeyvMock).toHaveBeenCalledTimes(1);
    const [clientOptions, adapterOptions] = createKeyvMock.mock.calls[0];

    // The regression we guard against: without these, a cache GET blocks for
    // many seconds while Redis is down instead of falling through to the DB
    // immediately. `disableOfflineQueue` is the load-bearing one — it is the
    // node-redis equivalent of ioredis' `enableOfflineQueue: false` (TASK-304).
    expect(clientOptions).toMatchObject({
      disableOfflineQueue: true,
      socket: { host: 'localhost', port: 6379, connectTimeout: 1000 },
    });
    expect(
      typeof (clientOptions as { socket: { reconnectStrategy: unknown } }).socket.reconnectStrategy,
    ).toBe('function');

    // A dead Redis must degrade, never abort boot or bubble up as a 5xx.
    expect(adapterOptions).toMatchObject({
      throwOnConnectError: false,
      throwOnErrors: false,
      connectionTimeout: 1000,
    });
  });

  it('caps the reconnect backoff so it never loops unbounded', async () => {
    await buildCacheOptions(configWith({ REDIS_HOST: 'localhost' }));

    const [clientOptions] = createKeyvMock.mock.calls[0];
    const { reconnectStrategy } = (
      clientOptions as { socket: { reconnectStrategy: (retries: number) => number } }
    ).socket;

    expect(reconnectStrategy(0)).toBe(200);
    expect(reconnectStrategy(100)).toBe(2000);
  });

  it('does not build a Redis store when REDIS_HOST is absent (in-memory fallback)', async () => {
    const result = await buildCacheOptions(configWith({ REDIS_CACHE_TTL_SECONDS: 60 }));

    expect(createKeyvMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ttl: 60_000 });
  });

  it('passes the Redis store through as a `stores` array alongside the TTL', async () => {
    const result = await buildCacheOptions(
      configWith({ REDIS_HOST: 'redis', REDIS_CACHE_TTL_SECONDS: 30 }),
    );

    // cache-manager v7 takes `{ stores: Keyv[] }`, not the v5 `{ store }`.
    expect(result).toEqual({ ttl: 30_000, stores: [{ name: 'keyv-redis' }] });
  });
});
