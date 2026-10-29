import { cookies, draftMode } from "next/headers";
import type {
  ResolvedPreviewTokenEntity,
  ResolvedPreviewTokenResponse,
} from "@/shared/api/generated/models";
import { serverFetch } from "@/shared/api/server-fetch";
import {
  PREVIEW_EXPIRES_COOKIE,
  PREVIEW_TOKEN_COOKIE,
  PREVIEW_TOKEN_HEADER,
} from "@/shared/api/preview-token";

/**
 * Server-only half of the signed preview (TASK-669): reading the preview
 * session off the request, and asking store-api what a token opens. The pure
 * names live in `preview-token.ts`.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** A live preview session: Next draft mode on AND a token cookie present. */
export interface PreviewSession {
  token: string;
  /** ISO `expiresAt` of the token, when the cookie carrying it survived. */
  expiresAt: string | null;
}

/**
 * The preview session of this request, or `null`.
 *
 * Draft mode is checked FIRST and the cookie jar is opened only inside it. That
 * order is what keeps every public render static: outside a request (`next
 * build`, an ISR revalidation) `draftMode()` reports "off" without opting the
 * route into dynamic rendering, whereas `cookies()` would. So a page that asks
 * this question stays exactly as cacheable as before it asked.
 */
export async function readPreviewSession(): Promise<PreviewSession | null> {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return null;
  const jar = await cookies();
  const token = jar.get(PREVIEW_TOKEN_COOKIE)?.value;
  if (!token) return null;
  return { token, expiresAt: jar.get(PREVIEW_EXPIRES_COOKIE)?.value ?? null };
}

/** The preview token of this request, or `null` — see {@link readPreviewSession}. */
export async function readPreviewToken(): Promise<string | null> {
  return (await readPreviewSession())?.token ?? null;
}

/**
 * Ask store-api whether `token` is good and where it leads
 * (`GET /api/preview-tokens/resolve`, TASK-668). The API is the only judge — the
 * storefront holds no secret. `null` for anything but a clean answer: an
 * invalid / expired / revoked token (404), a throttled oracle (429), an outage
 * or a timeout all mean "do not open a preview".
 */
export async function resolvePreviewToken(
  token: string,
): Promise<ResolvedPreviewTokenEntity | null> {
  try {
    const res = await serverFetch(
      `${API_BASE_URL}/api/preview-tokens/resolve`,
      {
        cache: "no-store",
        headers: { [PREVIEW_TOKEN_HEADER]: token },
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as ResolvedPreviewTokenResponse;
    return body.data ?? null;
  } catch {
    return null;
  }
}
