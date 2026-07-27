import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';
import { CacheService } from './cache.service';

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_REDIS_PORT = 6379;

/** Fail-fast budget for connecting to Redis, in milliseconds. */
const REDIS_TIMEOUT_MS = 1000;

/** Upper bound on the reconnect backoff, in milliseconds. */
const REDIS_MAX_RECONNECT_DELAY_MS = 2000;

/**
 * Builds the cache-manager options from config. Exported so the store wiring —
 * in particular the fail-fast client options — can be unit-tested without
 * standing up the whole Nest module (which would also pull in CacheService and
 * its PinoLogger dependency).
 *
 * Returns either a Keyv-wrapped Redis store (when `REDIS_HOST` is set) or a
 * plain `{ ttl }` that selects the bundled in-memory store.
 *
 * NOTE (TASK-304): `@nestjs/cache-manager` v3 / cache-manager v7 replaced the
 * single `{ store }` option with a `{ stores: Keyv[] }` array, and the Redis
 * adapter moved from `cache-manager-ioredis-yet` (ioredis) to `@keyv/redis`
 * (node-redis). The ioredis fail-fast knobs have direct node-redis equivalents,
 * mapped one-for-one below.
 */
export async function buildCacheOptions(config: ConfigService) {
  // cache-manager measures TTL in milliseconds.
  const ttlMs = (config.get<number>('REDIS_CACHE_TTL_SECONDS') ?? DEFAULT_TTL_SECONDS) * 1000;
  const host = config.get<string>('REDIS_HOST');

  if (!host) {
    return { ttl: ttlMs };
  }

  // `createKeyv` (rather than `new KeyvRedis(...)` wrapped by hand) because it
  // is the adapter's documented helper for storing keys WITHOUT a namespace
  // prefix. That matters here: `CacheService.delByPrefix` SCANs on the raw
  // application key prefix, and the adapter's default `keyv::` prefix would
  // silently make every prefix eviction match nothing.
  const store = createKeyv(
    {
      socket: {
        host,
        port: config.get<number>('REDIS_PORT') ?? DEFAULT_REDIS_PORT,
        // Fail-fast when Redis is unreachable. Without these, the client queues
        // commands offline and retries, so a cache GET blocks for many seconds
        // before erroring — degradation works but is far too slow. The bounded
        // reconnectStrategy keeps the background reconnect from looping forever.
        connectTimeout: REDIS_TIMEOUT_MS,
        reconnectStrategy: (retries: number) =>
          Math.min((retries + 1) * 200, REDIS_MAX_RECONNECT_DELAY_MS),
      },
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      // node-redis equivalent of ioredis `enableOfflineQueue: false`: a command
      // issued while disconnected rejects immediately instead of being queued,
      // so CacheService falls through to the DB in milliseconds.
      disableOfflineQueue: true,
    },
    {
      // Never let a dead Redis abort application boot or turn a cache lookup
      // into a 5xx — CacheService already treats every failure as a miss.
      throwOnConnectError: false,
      throwOnErrors: false,
      connectionTimeout: REDIS_TIMEOUT_MS,
    },
  );

  return { ttl: ttlMs, stores: [store] };
}

/**
 * RedisCacheModule — application cache layer.
 *
 * Declared `@Global()` (same pattern as `MailModule`) so `CacheService` is
 * injectable anywhere after a single import in `AppModule`, without each
 * consuming feature module re-importing it.
 *
 * The underlying store is chosen at boot from config:
 *   - `REDIS_HOST` set   → node-redis-backed Keyv store (`@keyv/redis`).
 *   - `REDIS_HOST` absent → the bundled in-memory store. The `CacheService`
 *     API is identical; the cache is simply per-process and lost on restart.
 *     This keeps local dev, CI, and e2e runs working with no Redis dependency.
 *
 * ConfigService is available app-wide because ConfigModule is registered
 * `isGlobal: true` in AppModule.
 */
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: buildCacheOptions,
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class RedisCacheModule {}
