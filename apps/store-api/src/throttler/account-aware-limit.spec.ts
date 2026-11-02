import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { accountAwareLimit } from './account-aware-limit';

/**
 * TASK-2010 review: a per-request limit that tells an account from a guest.
 *
 * The throttler is a GLOBAL guard, so it runs before the route's own
 * `OptionalJwtAuthGuard` — `request.user` is never set yet when the limit is
 * resolved. The resolver therefore verifies the bearer token itself, the same
 * way the review-author tracker does (TASK-598); an unverifiable header is a
 * guest, or a forged one would buy the account allowance.
 */
describe('accountAwareLimit', () => {
  const SECRET = 'account-aware-limit-spec-secret';
  const resolve = accountAwareLimit(20, 6);

  const contextWith = (authorization?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: authorization ? { authorization } : {} }),
      }),
    }) as unknown as ExecutionContext;

  const sign = (secret: string) =>
    new JwtService({ secret }).sign({ sub: 'user-1', role: 'CUSTOMER' }, { expiresIn: '15m' });

  let previousSecret: string | undefined;

  beforeAll(() => {
    previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = previousSecret;
  });

  it('gives a request with a valid access token the account limit', () => {
    expect(resolve(contextWith(`Bearer ${sign(SECRET)}`))).toBe(20);
  });

  it('gives a request with no token the guest limit', () => {
    expect(resolve(contextWith())).toBe(6);
  });

  it.each([
    ['a token signed with another secret', `Bearer ${sign('not-our-secret')}`],
    ['garbage', 'Bearer not-a-jwt'],
    ['a non-bearer scheme', 'Basic dXNlcjpwYXNz'],
  ])('treats %s as a guest — a forged header buys nothing', (_label, header) => {
    expect(resolve(contextWith(header))).toBe(6);
  });
});
