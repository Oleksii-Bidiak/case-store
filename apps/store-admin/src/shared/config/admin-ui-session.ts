/**
 * Name of the non-sensitive marker cookie that tells the edge proxy "a browser
 * on this origin believes it has an admin session".
 *
 * WHY THIS EXISTS AT ALL
 * ---------------------
 * The real session lives in the HttpOnly refresh cookie set by store-api — but
 * that cookie is scoped to the API's host (`api.<domain>`) and to the path
 * `/api/auth/refresh`. The admin app is served from a DIFFERENT host
 * (`admin.<domain>`), so its proxy CANNOT see the refresh cookie: reading it
 * from `proxy.ts` would always return undefined, and a guard built on that would
 * either redirect every logged-in admin in a loop or do nothing at all.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is NOT a security boundary and must never be treated as one. It carries no
 * token, proves nothing, and anyone can set it by hand. Authorisation stays
 * exactly where it already was: `AdminGuard` on every admin controller in
 * store-api, enforced against the signed JWT.
 *
 * What it buys is that the admin dashboard's HTML and JS bundle is no longer
 * served to a browser with no session at all. Someone who forges the cookie gets
 * the shell and nothing else — the bootstrap refresh fails, `AdminShellGuard`
 * redirects, and every API call 401s. That is exactly today's behaviour, so
 * there is no regression path here: only the anonymous case improves.
 */
export const ADMIN_UI_SESSION_COOKIE = "admin_ui_session";

/** Marker lifetime — mirrors the refresh token's 7 days. */
export const ADMIN_UI_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
