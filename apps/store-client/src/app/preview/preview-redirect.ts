/**
 * The 307 both preview route handlers answer with (TASK-669).
 *
 * The `Location` is a RELATIVE path on purpose: it is resolved by the browser
 * against the address it actually used, so the redirect stays on the public
 * origin behind the reverse proxy whatever host Next itself was reached on, and
 * it can never point at another site. Callers pass only paths that went through
 * `safeRelativePath` or are constants.
 *
 * The response is the preview switch itself — it carries the draft-mode and
 * token cookies — so no cache may keep it, and no crawler should index it.
 */
export function previewRedirect(path: string): Response {
  return new Response(null, {
    status: 307,
    headers: {
      Location: path,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
