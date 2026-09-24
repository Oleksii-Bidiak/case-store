/**
 * Sanitize a post-auth `?redirect=` target.
 *
 * Client-side twin of `sanitizeRedirectTarget` in
 * `apps/store-api/src/auth/oauth/sanitize-redirect-target.ts`, and deliberately
 * the same rules — that file already carried the note that it was the
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
 * TASK-770: TAB, LF and CR are stripped first, because the WHATWG URL parser
 * drops exactly those before it parses. `?redirect=/%09/evil.com` decodes to
 * `/\t/evil.com`, which does not start with `//` — yet
 * `new URL("/\t/evil.com", origin)` is `https://evil.com/`. The path rules run
 * on the stripped value, and the stripped value is what we return, so the check
 * and the navigation see the same string. Stripping also removes the CR/LF the
 * API would otherwise echo into its OAuth `Location` header.
 *
 * Anything that is not a plain same-origin path — absent, absolute, scheme-
 * bearing or protocol-relative — falls back to the homepage. A wrong-but-safe
 * landing page is a papercut; an off-site one is a credential theft.
 */
export function sanitizeRedirectTarget(raw: string | null | undefined): string {
  if (!raw) return "/";
  // What the URL parser ignores must not be able to hide a `//` from us.
  const target = raw.replace(/[\t\n\r]/g, "");
  if (!target.startsWith("/")) return "/";
  // Protocol-relative, and the backslash spelling browsers normalize into it.
  if (target.startsWith("//") || target.startsWith("/\\")) return "/";
  return target;
}
