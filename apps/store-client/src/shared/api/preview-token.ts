import type { ServerFetchInit } from "@/shared/api/server-fetch";

/**
 * The signed storefront preview (TASK-669, plan 186 «Два обмеження»).
 *
 * The storefront never signs or verifies a preview token: it only CARRIES one.
 * The `/preview` route asks the API whether a token is good, keeps it in an
 * httpOnly cookie, and the preview-aware reads forward it in a header. Whether a
 * draft is served is decided by store-api, which holds the only secret.
 *
 * This module is the pure half — names and request shapes, no `next/headers` —
 * so the ISR fetchers can import it without pulling request APIs in. The half
 * that reads the request lives in `preview-server.ts`.
 */

/** The request header store-api reads a preview token from (TASK-668). */
export const PREVIEW_TOKEN_HEADER = "x-preview-token";

/** httpOnly cookie that holds the token for the length of a preview session. */
export const PREVIEW_TOKEN_COOKIE = "preview_token";

/**
 * httpOnly cookie with the token's `expiresAt` (ISO), set alongside the token so
 * the preview bar can say until when the link works without decoding a token
 * the storefront is not meant to read.
 */
export const PREVIEW_EXPIRES_COOKIE = "preview_expires";

/** Metadata `robots` of every preview render: a draft is never indexed. */
export const PREVIEW_ROBOTS = { index: false, follow: false } as const;

/**
 * The cache directive of a public read that takes part in the preview.
 *
 * Without a token it is exactly the ISR read the route always made —
 * `{ next: { tags } }`, nothing else, so on-demand revalidation and the cache
 * key are untouched. With one it is the opposite on every axis: no tags (a
 * draft must never land in the Data Cache), `no-store`, and the token header
 * the API decides on.
 */
export function publicReadInit(
  tags: string[],
  previewToken?: string | null,
): ServerFetchInit {
  if (!previewToken) return { next: { tags } };
  return {
    cache: "no-store",
    headers: { [PREVIEW_TOKEN_HEADER]: previewToken },
  };
}

/**
 * Axios options for a generated call that takes part in the preview (the PDP's
 * `productControllerFindBySlug`): the caller's options, plus the token header
 * when there is one. Without a token the options come back as they were.
 */
export function withPreviewHeader<T extends object>(
  options: T,
  previewToken?: string | null,
): T & { headers?: Record<string, string> } {
  if (!previewToken) return options;
  const { headers } = options as { headers?: Record<string, string> };
  return {
    ...options,
    headers: { ...headers, [PREVIEW_TOKEN_HEADER]: previewToken },
  };
}

/**
 * A same-origin path to send the browser to, or `null`.
 *
 * Guards the `/preview` redirects against being an open redirect: only an
 * absolute PATH is accepted — never a scheme, a protocol-relative `//host`, a
 * backslash variant browsers normalise to one, or a control character.
 */
export function safeRelativePath(
  value: string | null | undefined,
): string | null {
  if (!value || value.length > 2048) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  // A backslash anywhere, or a control character (CR/LF/tab…), is refused.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
