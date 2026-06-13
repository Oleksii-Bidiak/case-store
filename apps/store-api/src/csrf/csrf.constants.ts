/** Header the client must echo the CSRF token back in on state-changing requests. */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Cookie name carrying the CSRF token. In production the `__Host-` prefix is
 * used, which the browser only accepts when the cookie is `Secure`, has
 * `Path=/`, and no `Domain` — preventing a sibling subdomain from overwriting
 * it. Over plain HTTP (development) `Secure` cookies are rejected, so a plain
 * name is used there.
 */
export const CSRF_COOKIE_PROD = '__Host-csrf';
export const CSRF_COOKIE_DEV = 'csrf';

/** HTTP methods that never mutate state and are therefore exempt from CSRF checks. */
export const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Weak default secret used only in development when CSRF_SECRET is unset. */
export const CSRF_DEV_FALLBACK_SECRET = 'dev-csrf-secret-change-me-in-prod-32b';
