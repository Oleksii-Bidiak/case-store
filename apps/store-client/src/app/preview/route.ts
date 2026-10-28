import { cookies, draftMode } from "next/headers";
import type { NextRequest } from "next/server";
import { resolvePreviewToken } from "@/shared/api/preview-server";
import {
  PREVIEW_EXPIRES_COOKIE,
  PREVIEW_TOKEN_COOKIE,
  safeRelativePath,
} from "@/shared/api/preview-token";
import { previewRedirect } from "./preview-redirect";

/**
 * `GET /preview?token=<token>` — the entry point of a shareable preview link
 * (TASK-669; the admin «Подивитись на сайті» builds exactly this URL).
 *
 * The storefront does not judge the token: it asks store-api
 * (`GET /api/preview-tokens/resolve`), which holds the only secret. On a clean
 * answer it turns Next draft mode on — every render of this browser then skips
 * the ISR cache and is served `private, no-store` — stores the token in an
 * httpOnly cookie until the token's own `expiresAt`, and sends the browser to
 * the path the API resolved from the CURRENT slug. The destination never comes
 * from the query string, so this cannot be used as an open redirect.
 *
 * Anything else — no token, a refused or expired one, an API outage — ends any
 * preview this browser had and lands on the «недійсне посилання» page
 * (mockup HomepageBlocks #invalid), which shows the public homepage under a
 * note and is `noindex`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get("token")?.trim() || null;
  const resolved = token ? await resolvePreviewToken(token) : null;
  const path = resolved ? safeRelativePath(resolved.path) : null;
  const expires = resolved ? new Date(resolved.expiresAt) : null;

  const draft = await draftMode();
  const jar = await cookies();

  if (
    !token ||
    !resolved ||
    !path ||
    !expires ||
    !Number.isFinite(expires.getTime())
  ) {
    draft.disable();
    jar.delete(PREVIEW_TOKEN_COOKIE);
    jar.delete(PREVIEW_EXPIRES_COOKIE);
    return previewRedirect("/preview/invalid");
  }

  draft.enable();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
  jar.set(PREVIEW_TOKEN_COOKIE, token, cookieOptions);
  jar.set(PREVIEW_EXPIRES_COOKIE, expires.toISOString(), cookieOptions);
  return previewRedirect(path);
}
