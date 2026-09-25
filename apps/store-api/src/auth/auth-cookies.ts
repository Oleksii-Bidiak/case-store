import type { CookieOptions } from 'express';

/** Name of the HttpOnly cookie that carries the refresh token. */
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/**
 * The refresh cookie is sent on exactly one route — the one that rotates it —
 * so no other request (and no log line of one) ever carries the token.
 */
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth/refresh';

/**
 * Attributes of the refresh cookie (TASK-824).
 *
 * One builder for both the set and the clear. A browser only drops a cookie
 * when the clearing `Set-Cookie` names the same path (and, in practice, the same
 * `SameSite`/`Secure`) as the one that set it, so two hand-written copies of
 * these options are one typo away from a logout that leaves the cookie behind.
 *
 * @param maxAgeMs lifetime of the cookie — the refresh token's own lifetime
 *   (TASK-789), so the browser never keeps a cookie the server already expired
 *   nor drops one the server would still honour.
 */
export function buildRefreshCookieOptions(isProduction: boolean, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

/**
 * The same cookie, expired. Takes the options the cookie was SET with, so a
 * clear can never drift from its set (see {@link buildRefreshCookieOptions}).
 */
export function expiredCookieOptions(setWith: CookieOptions): CookieOptions {
  return { ...setWith, maxAge: 0 };
}
