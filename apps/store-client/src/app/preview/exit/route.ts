import { cookies, draftMode } from "next/headers";
import type { NextRequest } from "next/server";
import {
  PREVIEW_EXPIRES_COOKIE,
  PREVIEW_TOKEN_COOKIE,
  safeRelativePath,
} from "@/shared/api/preview-token";
import { previewRedirect } from "../preview-redirect";

/**
 * `GET /preview/exit?to=<path>` — «Вийти з прев'ю» (TASK-669).
 *
 * Turns Next draft mode off, drops the token cookie, and sends the browser back
 * to the page it was on, now rendered as shoppers see it (a draft therefore
 * 404s, as it should). `to` must be a same-origin path; anything else — an
 * absolute URL, `//host`, a backslash trick — goes to `/` instead, so the exit
 * link cannot be turned into an open redirect.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const draft = await draftMode();
  draft.disable();
  const jar = await cookies();
  jar.delete(PREVIEW_TOKEN_COOKIE);
  jar.delete(PREVIEW_EXPIRES_COOKIE);

  const to = safeRelativePath(request.nextUrl.searchParams.get("to"));
  return previewRedirect(to ?? "/");
}
