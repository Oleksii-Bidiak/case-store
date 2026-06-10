import type { CookieOptions } from 'express';

/**
 * Resolved identity of the cart owner for the current request.
 * Set on `request.cartIdentity` by the CartIdentityInterceptor and read
 * by the `@CartIdentity()` param decorator.
 */
export type ResolvedCartIdentity =
  | { type: 'user'; userId: string }
  | { type: 'token'; token: string };

/** Name of the HttpOnly cookie that carries the guest cart token. */
export const CART_TOKEN_COOKIE = 'cartToken';

/** Guest carts persist for 30 days. */
const CART_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cookie options for the guest cart token. Mirrors the auth refresh-token
 * cookie conventions (httpOnly, secure in prod, strict sameSite) but uses
 * the broader `/api` path so the cookie is also sent on `/api/auth/login`
 * and `/api/auth/register`, enabling the guest→user cart merge.
 */
export function buildCartTokenCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api',
    maxAge: CART_TOKEN_MAX_AGE_MS,
  };
}
