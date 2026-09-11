import { Global, Module } from '@nestjs/common';
import { ThrottlerRedisHealth } from './throttler-redis-health';

/**
 * Provides {@link ThrottlerRedisHealth} (TASK-401).
 *
 * It is its own module — and a global one — because two very different places
 * need the SAME instance: the `ThrottlerModule.forRootAsync` factory (which
 * pings Redis at boot and hands the object to the storage) and `AppService`
 * (which reports the state on `/health`). A provider declared inside AppModule
 * could not be injected into that factory without this indirection.
 */
@Global()
@Module({
  providers: [ThrottlerRedisHealth],
  exports: [ThrottlerRedisHealth],
})
export class ThrottlerHealthModule {}
