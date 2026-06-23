import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { CacheService } from './cache.service';

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_REDIS_PORT = 6379;

/**
 * Builds the cache-manager options from config. Exported so the store wiring —
 * in particular the fail-fast ioredis options — can be unit-tested without
 * standing up the whole Nest module (which would also pull in CacheService and
 * its PinoLogger dependency).
 *
 * Returns either an ioredis-backed `{ store }` (when `REDIS_HOST` is set) or a
 * plain `{ ttl }` that selects the bundled in-memory store.
 */
export async function buildCacheOptions(config: ConfigService) {
  // cache-manager v5 measures TTL in milliseconds.
  const ttlMs = (config.get<number>('REDIS_CACHE_TTL_SECONDS') ?? DEFAULT_TTL_SECONDS) * 1000;
  const host = config.get<string>('REDIS_HOST');

  if (!host) {
    return { ttl: ttlMs };
  }

  const store = await redisStore({
    host,
    port: config.get<number>('REDIS_PORT') ?? DEFAULT_REDIS_PORT,
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    ttl: ttlMs,
    // Fail-fast when Redis is unreachable. Without these, ioredis queues
    // commands offline and retries for tens of seconds, so a cache GET blocks
    // ~1 min before erroring — degradation works but is far too slow. With
    // `enableOfflineQueue: false` a command throws immediately while
    // disconnected; CacheService catches it and falls through to the DB in
    // milliseconds. The bounded retryStrategy keeps the background reconnect
    // from hanging or looping forever.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    commandTimeout: 1000,
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  });

  return { store };
}

/**
 * RedisCacheModule — application cache layer.
 *
 * Declared `@Global()` (same pattern as `MailModule`) so `CacheService` is
 * injectable anywhere after a single import in `AppModule`, without each
 * consuming feature module re-importing it.
 *
 * The underlying store is chosen at boot from config:
 *   - `REDIS_HOST` set   → ioredis-backed store (`cache-manager-ioredis-yet`).
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
