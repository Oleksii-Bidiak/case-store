import {
  REFRESH_TOKEN_COOKIE_PATH,
  buildRefreshCookieOptions,
  expiredCookieOptions,
} from './auth-cookies';

describe('auth-cookies (TASK-824)', () => {
  it('builds an HttpOnly, SameSite=strict refresh cookie scoped to the refresh route', () => {
    expect(buildRefreshCookieOptions(true, 1000)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: 1000,
    });
  });

  it('is not Secure outside production (local http)', () => {
    expect(buildRefreshCookieOptions(false, 1000).secure).toBe(false);
  });

  it('expires a cookie with exactly the attributes it was set with', () => {
    const setWith = buildRefreshCookieOptions(true, 604_800_000);

    expect(expiredCookieOptions(setWith)).toEqual({ ...setWith, maxAge: 0 });
    // The input is not mutated — the caller may still use it.
    expect(setWith.maxAge).toBe(604_800_000);
  });
});
