import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_UI_SESSION_COOKIE } from "@/shared/config/admin-ui-session";

/**
 * Edge guard for the admin dashboard (TASK-307).
 *
 * NOTE ON THE FILE NAME: in Next 16 the `middleware` file convention is
 * deprecated and renamed to `proxy` — the function must be the default export or
 * named `proxy`. A `middleware.ts` here would simply never run.
 *
 * WHAT THIS DOES
 * --------------
 * Stops the dashboard's HTML and JS bundle from being served to a browser that
 * shows no sign of a session, redirecting it to /login before any rendering
 * happens. Today that shell is downloadable by anyone who knows the URL.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not an authorisation check, and nothing may be built on top of it as if
 * it were. It reads `admin_ui_session`, a non-HttpOnly marker cookie that
 * carries no token and that anyone can forge by hand.
 *
 * It has to work that way: the real session is the HttpOnly refresh cookie set by
 * store-api, which is scoped to the API's host (`api.<domain>`) and the path
 * `/api/auth/refresh`. This app is served from `admin.<domain>` — a different
 * host — so that cookie is not in `request.cookies` here and never will be. A
 * guard that tried to read it would find nothing every single time.
 *
 * Authorisation is, and stays, `AdminGuard` on every admin controller in
 * store-api, checked against the signed JWT. A forged marker gets you the shell
 * and nothing more: the bootstrap refresh fails, `AdminShellGuard` redirects, and
 * every API call comes back 401 — i.e. exactly what happens today. This is
 * defence in depth, not the defence.
 */
export function proxy(request: NextRequest) {
  const hasSessionMarker = request.cookies.has(ADMIN_UI_SESSION_COOKIE);

  if (hasSessionMarker) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);

  // Preserve where they were headed so login can send them back, but only for
  // real navigations — echoing a prefetch/RSC URL into `next` would bounce the
  // admin to a payload route after signing in.
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (target !== "/" && !request.nextUrl.searchParams.has("_rsc")) {
    loginUrl.searchParams.set("next", target);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Everything except: /login itself (which would loop), Next's internals and
   * static assets (blocking those would break the login page's own CSS/JS), and
   * the metadata files.
   *
   * Without a matcher, a proxy runs on EVERY request including `_next/static` —
   * so this negative lookahead is load-bearing, not tidiness.
   */
  matcher: [
    "/((?!login|api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
