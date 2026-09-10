import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpException } from '@nestjs/common';
import {
  ThrottlerException,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from './client-ip-throttler.guard';
import { FailClosedThrottle } from './fail-closed-throttle.decorator';
import { ThrottlerErrorCode, ThrottlerStorageUnavailableError } from './throttler.errors';

/**
 * These tests exist because the bug they encode was invisible in every unit
 * test and every local run: with no `trust proxy`, Express reported the Caddy
 * container's address as `req.ip`, so the global 100-requests-per-minute limiter
 * counted the whole internet as one client. Nothing errors, nothing logs — the
 * shop just starts answering 429 to people who have made three requests.
 *
 * The guard is constructed directly rather than through Nest: `getTracker` is
 * pure, and the DI graph adds nothing to what is being asserted.
 */
describe('ClientIpThrottlerGuard.getTracker', () => {
  const guard = Object.create(ClientIpThrottlerGuard.prototype) as ClientIpThrottlerGuard & {
    getTracker(req: Record<string, unknown>): Promise<string>;
  };

  it('counts the client address Express resolved through `trust proxy`', async () => {
    await expect(guard.getTracker({ ip: '203.0.113.7' })).resolves.toBe('203.0.113.7');
  });

  it('gives two different clients two different buckets', async () => {
    const first = await guard.getTracker({ ip: '203.0.113.7' });
    const second = await guard.getTracker({ ip: '198.51.100.4' });

    expect(first).not.toBe(second);
  });

  // The widely-copied `req.ips[0]` snippet reads the FURTHEST X-Forwarded-For
  // entry — the part an untrusted client wrote. Caddy appends the real peer, so
  // a request carrying `X-Forwarded-For: 9.9.9.9` arrives as `9.9.9.9, <real>`;
  // trusting ips[0] would let anyone rotate that value for an unlimited quota.
  it('ignores a spoofed upstream X-Forwarded-For entry', async () => {
    const tracker = await guard.getTracker({
      ip: '203.0.113.7', // what `trust proxy` resolved: the real peer
      ips: ['9.9.9.9', '203.0.113.7'], // what the client claimed, then the truth
    });

    expect(tracker).toBe('203.0.113.7');
    expect(tracker).not.toBe('9.9.9.9');
  });

  // Non-HTTP or malformed contexts must still separate callers. Returning a
  // constant here would silently rebuild the single shared bucket.
  it('falls back to the socket address when Express did not populate ip', async () => {
    await expect(guard.getTracker({ socket: { remoteAddress: '198.51.100.9' } })).resolves.toBe(
      '198.51.100.9',
    );
  });

  it('returns a stable sentinel when there is no address at all', async () => {
    await expect(guard.getTracker({})).resolves.toBe('unknown');
  });
});

/**
 * TASK-401 — what the guard does when the counter store is DOWN.
 *
 * The demo stand ran the whole session with Redis misconfigured: the storage
 * caught the error, returned "0 hits", and every limit in the API was off —
 * seven contact submissions against a 5/min cap, and `/auth/login` accepting
 * unlimited password attempts. The storage now raises; these tests pin the two
 * answers the guard is allowed to give, because getting the split wrong in
 * either direction is a real incident: fail-open on login is the bug above,
 * fail-closed on reads turns a Redis blip into a dead storefront.
 *
 * The guard is built with its real constructor here (not `Object.create`): the
 * whole point is the interaction of the reflector, the storage and the base
 * class's `handleRequest`.
 */
describe('ClientIpThrottlerGuard when the rate-limit store is unavailable', () => {
  class ProbeController {
    /** Stands in for POST /api/contact, /auth/login, /orders … */
    @FailClosedThrottle()
    publicWrite(): void {}

    /** Stands in for GET /api/products — no decorator, so fail-open. */
    read(): void {}
  }

  const options: ThrottlerModuleOptions = { throttlers: [{ ttl: 60_000, limit: 5 }] };

  const buildGuard = async (storage: ThrottlerStorage): Promise<ClientIpThrottlerGuard> => {
    const guard = new ClientIpThrottlerGuard(options, storage, new Reflector());
    await guard.onModuleInit();
    return guard;
  };

  const contextFor = (handler: () => void): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => ProbeController,
      switchToHttp: () => ({
        getRequest: () => ({ ip: '203.0.113.7', headers: {} }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    }) as unknown as ExecutionContext;

  const unreachableStorage = (): ThrottlerStorage => ({
    increment: jest
      .fn()
      .mockRejectedValue(new ThrottlerStorageUnavailableError('NOAUTH Authentication required')),
  });

  it('refuses a public write with 503 and a stable error code', async () => {
    const guard = await buildGuard(unreachableStorage());

    const thrown = await guard.canActivate(contextFor(ProbeController.prototype.publicWrite)).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(HttpException);
    const exception = thrown as HttpException;
    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception.getResponse()).toMatchObject({
      error: ThrottlerErrorCode.STORAGE_UNAVAILABLE,
    });
  });

  it('still serves a route that did not opt in — reads must survive a Redis blip', async () => {
    const guard = await buildGuard(unreachableStorage());

    await expect(guard.canActivate(contextFor(ProbeController.prototype.read))).resolves.toBe(true);
  });

  // The storage failure must not swallow the ordinary over-limit case: a client
  // that really did exceed the limit still gets 429, not 503.
  it('lets a genuine over-limit rejection through unchanged', async () => {
    const guard = await buildGuard({
      increment: jest.fn().mockResolvedValue({
        totalHits: 6,
        timeToExpire: 30,
        isBlocked: true,
        timeToBlockExpire: 60,
      }),
    });

    await expect(
      guard.canActivate(contextFor(ProbeController.prototype.publicWrite)),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  // A bug in the storage (a typo, a bad reply shape) is not a rate-limit outage
  // and must not be dressed up as a tidy 503 on some routes and ignored on others.
  it('does not disguise an unrelated storage bug', async () => {
    const guard = await buildGuard({
      increment: jest.fn().mockRejectedValue(new TypeError('reply.map is not a function')),
    });

    await expect(
      guard.canActivate(contextFor(ProbeController.prototype.read)),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
