import type { Response } from 'express';

/** The request header the storefront forwards a preview token in (TASK-668). */
export const PREVIEW_TOKEN_HEADER = 'x-preview-token';

/**
 * Mark a response that was served under a valid preview token (plan 186, constraint 1):
 * a draft must never land in a shared cache or a search index. `private, no-store`
 * keeps every cache between us and the browser from storing it; `X-Robots-Tag` keeps
 * it out of the index even if the storefront forgot its `noindex` meta.
 *
 * Called ONLY when the token actually opened something on this response — an invalid,
 * expired, revoked or other-scope token leaves the response untouched, byte for byte.
 */
export function markPreviewResponse(response: Response): void {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Robots-Tag', 'noindex');
}
