import { ClientIpThrottlerGuard } from './client-ip-throttler.guard';

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
