import { Test } from '@nestjs/testing';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ClientIpThrottlerGuard } from '../src/throttler';
import { applyProxyTrust } from '../src/config/trust-proxy';

/**
 * E2E for TASK-386 — one rate-limit bucket per visitor, not one for the shop.
 *
 * ## The bug this locks down
 *
 * In production every request reaches the API through Caddy on the compose
 * network. Express only believes `X-Forwarded-For` when `trust proxy` is set,
 * and it was not — so `req.ip` was the CADDY CONTAINER's address, identical for
 * every visitor on the internet. `ThrottlerGuard` tracks by `req.ip`, and the
 * global limit is 100 requests / 60 s, so the whole storefront shared ONE
 * bucket. A handful of simultaneous shoppers (a page view costs several API
 * calls) would 429 each other, and buying a bigger server would not have moved
 * the number at all. Nothing errored and nothing logged; it would have looked
 * like "the site is flaky under load".
 *
 * ## Why this suite builds its own tiny app
 *
 * The whole point is the interaction of three things — `trust proxy`, the
 * guard's tracker, and a real HTTP request with real headers. Booting AppModule
 * would drag in the DB and auth for no benefit, and its 100-request limit would
 * need 200 requests to exercise. A 2-request limit over one route proves the
 * same property in milliseconds. `applyProxyTrust` is imported from the shared
 * helper `main.ts` uses, so this cannot pass against a configuration production
 * does not have.
 */
@Controller('probe')
class ProbeController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 2 }] })],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
class ProbeModule {}

const ALICE = '203.0.113.7';
const BOB = '198.51.100.4';

describe('Rate limiting is per client IP (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [ProbeModule] }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    applyProxyTrust(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Supertest talks over loopback, so Caddy's appended real peer is simulated. */
  const get = (forwardedFor: string) =>
    request(app.getHttpServer()).get('/probe').set('X-Forwarded-For', forwardedFor);

  it('spends one visitor’s quota without touching another’s', async () => {
    await get(ALICE).expect(200);
    await get(ALICE).expect(200);

    // Alice is now at her limit of 2.
    await get(ALICE).expect(429);

    // Bob has made no requests at all. Before `trust proxy` he would have been
    // counted as the same client and rejected here — the whole bug in one line.
    await get(BOB).expect(200);
    await get(BOB).expect(200);
    await get(BOB).expect(429);
  });

  // Caddy APPENDS the real peer, so a forged header arrives as
  // `<forged>, <real>`. Trusting the furthest entry (`req.ips[0]`, the snippet
  // everyone copies) would let a client rotate that value for unlimited quota.
  it('cannot be bypassed by prepending a forged X-Forwarded-For', async () => {
    const forged = (claim: string) =>
      request(app.getHttpServer()).get('/probe').set('X-Forwarded-For', `${claim}, ${BOB}`);

    await forged('9.9.9.9').expect(429); // Bob is already exhausted above
    await forged('8.8.8.8').expect(429); // a different lie, same real client
  });
});
