import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerHealthModule } from './throttler-health.module';
import { ThrottlerRedisHealth } from './throttler-redis-health';
import { buildThrottlerOptions } from './throttler.config';

/**
 * TASK-401 — the wiring, not the behaviour.
 *
 * `/health` can only report the limiter's state if `AppService` and the
 * `ThrottlerModule.forRootAsync` factory hold the SAME `ThrottlerRedisHealth`.
 * That is an assumption about Nest's module graph — a global module resolved
 * inside a dynamic module's factory — and it fails at BOOT, not in a unit test:
 * the app would simply refuse to start, or worse, quietly report `disabled`
 * forever from a second instance nobody writes to. This mirrors exactly how
 * AppModule wires it, so the assumption is checked here rather than on a stand.
 */
describe('ThrottlerHealthModule wiring', () => {
  const previousRedisHost = process.env.REDIS_HOST;

  beforeAll(() => {
    // In-memory store: this test is about the graph, not about Redis.
    process.env.REDIS_HOST = '';
  });

  afterAll(() => {
    process.env.REDIS_HOST = previousRedisHost;
  });

  it('hands the throttler factory the same instance the app can inject', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot(),
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerHealthModule,
        ThrottlerModule.forRootAsync({
          imports: [ConfigModule, ThrottlerHealthModule],
          inject: [ConfigService, ThrottlerRedisHealth],
          useFactory: buildThrottlerOptions,
        }),
      ],
    }).compile();

    // `disabled` is only set by the factory. Reading it back from the container
    // proves both halves resolved to one object.
    expect(moduleRef.get(ThrottlerRedisHealth).status).toBe('disabled');

    await moduleRef.close();
  });
});
