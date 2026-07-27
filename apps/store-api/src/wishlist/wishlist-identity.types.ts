import type { CookieOptions } from 'express';

/**
 * Resolved identity of the wishlist owner for the current request.
 * Set on `request.wishlistIdentity` by the WishlistIdentityInterceptor and read
 * by the `@WishlistIdentity()` param decorator.
 *
 * Parallel copy of the cart's `ResolvedCartIdentity` (TASK-076 deliberately
 * mirrors the guest-cart identity infra rather than coupling to it; a later
 * refactor can extract a shared `guest-identity` primitive).
 */
export type ResolvedWishlistIdentity =
  { type: 'user'; userId: string } | { type: 'token'; token: string };

/** Name of the HttpOnly cookie that carries the guest wishlist token. */
export const WISHLIST_TOKEN_COOKIE = 'wishlistToken';

/** Guest wishlists persist for 30 days (same horizon as the guest cart). */
const WISHLIST_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cookie options for the guest wishlist token. Mirrors the cart token cookie
 * conventions (httpOnly, secure in prod, strict sameSite) and uses the broader
 * `/api` path so the cookie is also sent on `/api/auth/login` and
 * `/api/auth/register`, enabling the guest→user wishlist merge.
 */
export function buildWishlistTokenCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api',
    maxAge: WISHLIST_TOKEN_MAX_AGE_MS,
  };
}
