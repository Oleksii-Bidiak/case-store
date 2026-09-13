/**
 * Sanitize a post-auth `?redirect=` target.
 *
 * Client-side twin of `sanitizeRedirectTarget` in
 * `apps/store-api/src/auth/oauth/sanitize-redirect-target.ts`, and deliberately
 * the same three rules — that file already carried the note that it was the
 * "hardened" mirror of a looser check here, which is another way of saying the
 * storefront had a hole the API had already closed.
 *
 * The hole: both auth forms accepted any value starting with `/`, and
 * `//evil.com` starts with `/`. A browser reads that as protocol-relative, and
 * Next's router resolves it against the current origin, finds a different one
 * and performs a real top-level navigation. So `/login?redirect=//evil.com`
 * signed a shopper in with their real credentials and then dropped them on an
 * attacker's page — the classic post-login phishing hand-off, and all the more
 * convincing for starting on the genuine site. `/\evil.com` is the same attack:
 * browsers normalize the backslash to `//`.
 *
 * Anything that is not a plain same-origin path — absent, absolute, scheme-
 * bearing, protocol-relative, or carrying CR/LF — falls back to the homepage.
 * A wrong-but-safe landing page is a papercut; an off-site one is a credential
 * theft.
 */
export function sanitizeRedirectTarget(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  // Protocol-relative, and the backslash spelling browsers normalize into it.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // Header-injection guard: harmless in the router, but this value is also
  // handed to the API's Google OAuth leg, which echoes it into a `Location`.
  if (raw.includes("\r") || raw.includes("\n")) return "/";
  return raw;
}
