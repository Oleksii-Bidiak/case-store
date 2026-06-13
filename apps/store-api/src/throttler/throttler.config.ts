import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage';

/** Default global window: 100 requests per 60 seconds. */
const DEFAULT_TTL_MS = 60000;
const DEFAULT_LIMIT = 100;
const DEFAULT_REDIS_PORT = 6379;

/**
 * Build ThrottlerModule options from configuration.
 *
 * When `REDIS_HOST` is set, rate-limit counters are stored in Redis (shared
 * across instances) under a `throttle:` key prefix — kept separate from the
 * product cache keys (`product:*`) that share the same Redis. Otherwise the
 * module falls back to the default in-memory store, so the app boots and
 * throttles correctly without a Redis dependency in local development.
 */
export function buildThrottlerOptions(configService: ConfigService): ThrottlerModuleOptions {
  const throttlers = [{ ttl: DEFAULT_TTL_MS, limit: DEFAULT_LIMIT }];
  const redisHost = configService.get<string>('REDIS_HOST');

  if (!redisHost) {
    return { throttlers };
  }

  const redis = new Redis({
    host: redisHost,
    port: configService.get<number>('REDIS_PORT', DEFAULT_REDIS_PORT),
    password: configService.get<string>('REDIS_PASSWORD'),
    keyPrefix: 'throttle:',
    // Don't crash boot when Redis is briefly unreachable; storage fails open.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  redis.on('error', (err) => {
    new Logger('ThrottlerRedis').warn(`Redis connection error: ${err.message}`);
  });

  return {
    throttlers,
    storage: new RedisThrottlerStorage(redis),
  };
}
