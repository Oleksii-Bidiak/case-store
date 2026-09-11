import { Test } from '@nestjs/testing';
import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, type ThrottlerStorage } from '@nestjs/throttler';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  ClientIpThrottlerGuard,
  FailClosedThrottle,
  ThrottlerErrorCode,
  ThrottlerStorageUnavailableError,
} from '../src/throttler';

/**
 * E2E for TASK-401 — what the API answers over real HTTP when the rate-limit
 * store is down.
 *
 * ## The bug this locks down (SF-CNT-19)
 *
 * On the demo stand Redis was misconfigured for the whole run. The storage
 * caught every error and returned "0 hits so far", so the API served seven
 * contact submissions against a 5/min cap and would have accepted unlimited
 * password attempts on `/auth/login`. Nothing errored, nothing alerted,
 * `/health` said `ok`: the rate limiter was OFF and every signal we had said it
 * was on.
 *
 * ## Why this suite builds its own tiny app
 *
 * What is being asserted is the guard's split — the same class production
 * registers as `APP_GUARD`, the same `@FailClosedThrottle()` decorator the six
 * real routes carry, and a storage that fails the way a dead Redis fails.
 * Booting AppModule would add a database, auth and a mail outbox to a question
 * none of them participate in. WHICH real routes carry the decorator is pinned
 * separately, and without HTTP, in `src/throttler/fail-closed-routes.spec.ts` —
 * together the two cover the acceptance criteria (`POST /contact` → 503,
 * `GET /products` → 200) without either test having to boot the world.
 *
 * The probe routes below mirror the real ones one-for-one: a public write that
 * opted in, and a read that did not.
 */
@Controller()
class ProbeController {
  /** Stands in for POST /api/contact. */
  @Post('contact')
  @FailClosedThrottle()
  submit(@Body() body: unknown): { data: unknown } {
    return { data: body };
  }

  /** Stands in for GET /api/products. */
  @Get('products')
  list(): { data: [] } {
    return { data: [] };
  }
}

/** A store that fails exactly the way `RedisThrottlerStorage` fails on a dead Redis. */
const unreachableStorage: ThrottlerStorage = {
  increment: () =>
    Promise.reject(new ThrottlerStorageUnavailableError('NOAUTH Authentication required')),
};

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5 }],
      storage: unreachableStorage,
    }),
  ],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
class ProbeModule {}

describe('Rate limiting fails closed on public writes (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [ProbeModule] }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a public write with 503 and a stable error code', async () => {
    const response = await request(app.getHttpServer())
      .post('/contact')
      .send({ name: 'Ivan', message: 'Доброго дня' })
      .expect(503);

    // The code — not the wording — is what the storefront branches on. The
    // envelope's `error` field is the only extra property HttpExceptionFilter
    // forwards (see throttler.errors.ts).
    expect(response.body.error).toBe(ThrottlerErrorCode.STORAGE_UNAVAILABLE);
    expect(typeof response.body.message).toBe('string');
  });

  // The other half of the contract, and the reason this is not simply "return
  // 503 when Redis is down": a shop that stops showing products because a cache
  // container restarted has turned a degraded limiter into an outage.
  it('keeps serving reads while the store is down', async () => {
    await request(app.getHttpServer()).get('/products').expect(200).expect({ data: [] });
  });

  it('answers reads repeatedly — the failure is not counted against the client', async () => {
    await request(app.getHttpServer()).get('/products').expect(200);
    await request(app.getHttpServer()).get('/products').expect(200);
    await request(app.getHttpServer()).get('/products').expect(200);
  });
});
