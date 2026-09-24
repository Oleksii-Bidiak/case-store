/**
 * Sanitize the admin login's `?redirect=` target.
 *
 * TASK-527: a COPY — deliberately not a shared import, the two apps share no
 * package — of the storefront's
 * `apps/store-client/src/features/auth/lib/sanitize-redirect-target.ts`, which
 * is itself the client-side twin of the API's
 * `apps/store-api/src/auth/oauth/sanitize-redirect-target.ts`. All three apply
 * the same rules; change one and change the others. The test next to this file
 * runs the storefront's case table verbatim, so the two can be diffed.
 *
 * The hole it closes: the admin login accepted any value starting with `/`, and
 * `//evil.com` starts with `/`. A browser reads that as protocol-relative, and
 * Next's router resolves it against the current origin, finds a different one
 * and performs a real top-level navigation. So `/login?redirect=//evil.com`
 * signed an administrator in with their real credentials and then dropped them
 * on an attacker's page — the classic post-login phishing hand-off, and all the
 * more convincing for starting on the genuine site. `/\evil.com` is the same
 * attack: browsers normalize the backslash to `//`.
 *
 * TASK-770: TAB, LF and CR are stripped first, because the WHATWG URL parser
 * drops exactly those before it parses. `?redirect=/%09/evil.com` decodes to
 * `/\t/evil.com`, which does not start with `//` — yet
 * `new URL("/\t/evil.com", origin)` is `https://evil.com/`. The path rules run
 * on the stripped value, and the stripped value is what we return, so the check
 * and the navigation see the same string.
 *
 * Anything that is not a plain same-origin path — absent, absolute, scheme-
 * bearing or protocol-relative — falls back to the dashboard (`/`). A
 * wrong-but-safe landing page is a papercut; an off-site one is a credential
 * theft.
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
